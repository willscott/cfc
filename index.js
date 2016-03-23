/**
 * index.js - cfc main entry point.
 * Copyright 2016 Yawning Angel.  All Rights Reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";

var self = require("sdk/self");
var tabs = require("sdk/tabs");
var pageMod = require("sdk/page-mod");
var preferences = require("sdk/simple-prefs").prefs;
var { when: unload } = require("sdk/system/unload");
var { Ci, Cu, Cr } = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");

const { getMostRecentBrowserWindow } = require("sdk/window/utils");

const ON_MODIFY_REQUEST = "http-on-modify-request";
const ON_EXAMINE_RESPONSE = "http-on-examine-response";
const ON_PAGE_LOAD = "DOMContentLoaded";

const ARCHIVE_POPUP_ID = "cfc-archive-popup";
const ARCHIVE_NOTIFICATION_BOX_ID = "cfc-archive-notification";

var CFPolicy = {
  ALLOW_GLOBAL : 0,
  DENY_GLOBAL : 1,
  DENY_CAPTCHA : 2,
  PER_SITE : 3,
};

var CFStyle = {
  POPUPNOTIFICATION : 0,
  NOTIFICATIONBOX : 1,
};

/*
 * This function gets the contentWindow and other good stuff from loadContext of
 * httpChannel.
 *
 * Taken from: https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser
 * with correctness fixes.
 */
function loadContextGoodies(httpChannel) {
  var loadContext;
  try {
    var interfaceRequestor = httpChannel.notificationCallbacks.QueryInterface(Ci.nsIInterfaceRequestor);
    try {
      loadContext = interfaceRequestor.getInterface(Ci.nsILoadContext);
    } catch (ex) {
      try {
        loadContext = subject.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
      } catch (ex2) {}
    }
  } catch (ex0) {}

  if (!loadContext) {
    // No load context, it's probably loading a resource.
    return null;
  } else {
    if (!loadContext.hasOwnProperty("associatedWindow")) {
      // This channel does not have a window, its probably loading a resource.
      return null;
    }

    try {
      var contentWindow = loadContext.associatedWindow;
      var aDOMWindow = contentWindow.top.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsIDocShellTreeItem)
        .rootTreeItem
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindow);
      try {
        var gBrowser = aDOMWindow.gBrowser;
        var aTab = gBrowser._getTabForContentWindow(contentWindow.top);
        var browser = aTab.linkedBrowser;
        return {
          aDOMWindow: aDOMWindow,
          gBrowser: gBrowser,
          aTab: aTab,
          browser: browser,
          contentWindow: contentWindow
        };
      } catch (ex1) {}
    } catch (ex0) {}
  }
}

function cancelRequest(aSubject) {
  aSubject.cancel(Cr.NS_BINDING_ABORTED);
}

function getURIDomain(aURI) {
    try {
      return Services.eTLD.getBaseDomain(aURI, 0);
    } catch(ex) {
      return aURI.host;
    }
}

var cfc = {
  _internalWhitelist: {
    "archive.is": true,
    "archive.li": true,
  },
  _blacklist: {},
  _cflist: {},

  onStartup: function() {
    Services.obs.addObserver(this, ON_MODIFY_REQUEST, false);
    Services.obs.addObserver(this, ON_EXAMINE_RESPONSE, false);

    if (preferences.cfRewrite) {
      pageMod.PageMod({
        include: "*",
        contentScriptFile: "./whyCaptchaRewrite.js",
        contentScriptWhen: "ready"
      });
    }

    unload(this.onShutdown);
  },

  onShutdown: function(aReason) {
    try {
      Services.obs.removeObserver(this, ON_MODIFY_REQUEST);
      Services.obs.removeObserver(this, ON_EXAMINE_RESPONSE);
    } catch(ex) {}
  },

  observe: function(aSubject, aTopic, aData) {
    var aChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
    var channelParams = loadContextGoodies(aChannel);
    var aBrowser = (channelParams != null) ? channelParams.gBrowser : null;
    var uri = aSubject.URI;
    var uriStr = uri.spec;

    if (ON_MODIFY_REQUEST == aTopic) {
      /* Examine our censorship cache to see if we know that the target host
       * requires circumvention.
       */
      if (this.isBlacklisted(uri)) {
        cancelRequest(aSubject);
        if (aBrowser != null) {
          this.fetchArchiveIs(aBrowser, uriStr);
        }
        return;
      }

      /* Various quality of life/privacy fixes unrelated to the great satan. */
      var domain = getURIDomain(uri);

      /* imgur's gifv is WebM.  The privacy slider on higher settings doesn't
       * play nice with this, so rewrite the link to request the animated GIF
       * transparently.
       */
      if (preferences.imgurGifvRewrite) {
        if ("imgur.com" == domain && uriStr.toLowerCase().endsWith(".gifv")) {
          cancelRequest(aSubject);
          this.fetch(uriStr.slice(0, -1));
          return;
        }
      }

      /* Kill reddit.com's outbound link tracking with fire. */
      if (preferences.redditOutboundLinkTracking) {
        if ("events.redditmedia.com" == uri.host || "out.reddit.com" == uri.host) {
          cancelRequest(aSubject);
          return;
        }
      }
    } else if (ON_EXAMINE_RESPONSE == aTopic) {
      /* Skip further processing on whitelisted hosts. */
      if (this.isWhitelisted(uri)) {
        return;
      }

      /* Check the response to see if the target site is hosted by
       * CloudFlare.
       *
       * As far as I can tell, this is indicated by two things:
       *  * The `Server` header being `cloudflare-nginx`.
       *  * The presence of a `CF-RAY` header (Always?).
       */
      var cfHosted = false;
      try {
        if (("cloudflare-nginx" == aSubject.getResponseHeader("Server") ||
             null != aSubject.getResponseHeader("CF-RAY"))) {
          cfHosted = true;
        }
      } catch (ex) {
        /* XXX: Should probably handle this properly, but just suppress
         * exceptions for now under the assumption that the site isn't
         * hosted by the evil empire.
         */
      }
      if (!cfHosted) {
        return;
      }
      this._cflist[getURIDomain(uri)] = true;

      if (CFPolicy.ALLOW_GLOBAL == preferences.cfPolicy) {
        return;
      } else {
        /* CloudFlare served the request, so handle it according to the
         * currently configured policy.
         */

        if (CFPolicy.DENY_GLOBAL == preferences.cfPolicy) {
          cancelRequest(aSubject);
          if (aBrowser != null) {
            this.fetchArchiveIs(aBrowser, uriStr);
          }
        } else {
          /* Per site or automatic redirect on captcha.  This is the "wrong"
           * way to do this, with the "right" way involving attaching a page
           * script to the tab, and some IPC.
           */
          if (aBrowser != null) {
            var trampoline;
            trampoline = function(aEvent) {
              cfc.onPageLoad(aBrowser, trampoline, aEvent);
            };
            aBrowser.addEventListener(ON_PAGE_LOAD, trampoline, false);
          }
        }
      }
    }
  },

  onPageLoad: function(aBrowser, aTrampoline, aEvent) {
    /* WARNING: DO NOt MODIFY THE DOM FROM WITHIN THIS ROUTINE.
     *
     * It's sort of ok to do things the "wrong" way since all I'm doing is
     * inspecting the DOM.  Since content scripts dont' appear to be able to
     * add browser UI elements (like a notification box/door hanger), IPC
     * is required which is overcomplicated for now.
     *
     * If you modify the DOM, scripts that are part of the page can see
     * your changes.  Attach a content script on the `ready` or `pageshow`
     * tab event. and modify the DOM from there, since that has isolation.
     */

    /* Remove the onPageLoad handler so that loading resources doesn't trigger
     * the code.
     */
    aBrowser.removeEventListener(ON_PAGE_LOAD, aTrampoline);

    var doc = aEvent.originalTarget;
    var win = doc.defaultView;

    /* Suppress further processing for things like xul:image (favicon).
     *
     * XXX: 99% sure this will never happen since resource fetches will fail
     * to return a `gBrowser` object.
     */
    if (doc.nodeName != "#document") {
      return;
    }

    /* Only want to peek into the DOM and take action on a captcha. */
    if (doc.title != "Attention Required! | CloudFlare") {
      return;
    }

    /* Reach into the DOM to ensure that this really is a captcha page. */

    var container = doc.body.querySelector(".cf-captcha-container");
    if (container == null) {
      return;
    }
    var formEle = container.querySelector(".challenge-form");
    if (formEle == null) {
      return;
    }

    if (CFPolicy.DENY_CAPTCHA == preferences.cfPolicy) {
      this.fetchArchiveIs(aBrowser, doc.URL);
      return;
    }

    if (CFStyle.POPUPNOTIFICATION == preferences.cfStyle) {
      this.archivePopupNotification(aBrowser, doc.URL);
    } else if (CFStyle.NOTIFICATIONBOX == preferences.cfStyle) {
      this.archiveNotificationBox(aBrowser, doc.URL);
    }
  },

  archivePopupNotification: function(aBrowser, aURL) {
    let { PopupNotifications } = getMostRecentBrowserWindow();

    PopupNotifications.show(
      getMostRecentBrowserWindow().gBrowser.selectedBrowser,
      ARCHIVE_POPUP_ID,
      "CloudFlare Captcha detected!",
      null, /* anchor ID */
      {
        label: "Fetch from archive.is",
        accessKey: "a",
        callback: function() {
          cfc.fetchArchiveIs(aBrowser, aURL);
        }
      },
      null,  /* secondary action */
      {
        persistence: 0, /* Clear on next page load. */
        popupIconURL: self.data.url("spray-can-64.png"),
      }
      );
  },

  archiveNotificationBox: function(aBrowser, aURL) {
    let notifyBox = aBrowser.getNotificationBox();
    let buttons = [];

    let button = {
        isDefault: true,
        accessKey: "a",
        label: "Fetch from archive.is",
        callback: function(aNotification, aButtonInfo, aEventTarget) {
          cfc.fetchArchiveIs(aBrowser, aURL);
        },
        type: "", // If a popup, then must be: "menu-button" or "menu".
        popup: null
    };
    buttons.push(button);

    notifyBox.appendNotification("CloudFlare Captcha detected!",
                                 ARCHIVE_NOTIFICATION_BOX_ID,
                                 "",
                                 notifyBox.PRIORITY_CRITICAL_HIGH, buttons,
                                 null);
  },

  fetch: function(aURL) {
    /* Load without replacing history. */
    tabs.activeTab.url = aURL;
  },

  fetchArchiveIs: function(aBrowser, aURL) {
    /* Load with replacing history.  Things need to be this way since
     * it's a huge pain to hook the pageshow event (needed since
     * `DOMContentLoaded` doesn't fire on Forward/Back navigation.
     *
     * XXX: Unfortunately triggering the load (despite the "stop all the
     * things" flag) doesn't halt resource loads in progress for some stupid
     * reason.
     */
    let flags = Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY | Ci.nsIWebNavigation.LOAD_FLAGS_STOP_CONTENT;
    aBrowser.loadURIWithFlags("https://archive.is/timegate/" + aURL, flags);
  },

  isWhitelisted: function(aURI) {
    var domain = getURIDomain(aURI);
    if (this._internalWhitelist.hasOwnProperty(domain)) {
      return true;
    }
    // TODO: User whitelist.
    return false;
  },

  isBlacklisted: function(aURI) {
    var domain = getURIDomain(aURI);
    if (CFPolicy.DENY_GLOBAL == preferences.cfPolicy && this._cflist.hasOwnProperty(domain)) {
      return true;
    }
    return this._blacklist.hasOwnProperty(domain);
  },
};

/* Call the object's main initialization point that does all the actual work. */
cfc.onStartup();

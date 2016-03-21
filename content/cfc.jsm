/**
 * cfc.jsm - cfc main module.
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

var EXPORTED_SYMBOLS = [ "cfc" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/devtools/Console.jsm");
Cu.import("chrome://cfc/content/utils.jsm");

const ON_MODIFY_REQUEST = "http-on-modify-request";
const ON_EXAMINE_RESPONSE = "http-on-examine-response";
const ON_PAGE_LOAD = "DOMContentLoaded";

var CFPolicy = {
  ALLOW_GLOBAL : 0,
  DENY_GLOBAL : 1,
  DENY_CAPTCHA : 2,
  PER_SITE : 3,
};

function cancelRequest(aSubject) {
  aSubject.cancel(Components.results.NS_BINDING_ABORTED);
}

var cfc = {
  _observerService : null,
  _tldService : null,

  //_cfPolicy : CFPolicy.DENY_GLOBAL,
  _cfPolicy : CFPolicy.PER_SITE,
  _internalWhitelist : {
    "archive.is" : true,
    "archive.li" : true,
  },
  _blacklist : {},
  _redditPrivacyFixes : true,
  _imgurGifvRewrite : true,

  onStartup : function(aData, aReason) {
    this._observerService = Services.obs;
    this._tldService = Services.eTLD;
    this.init();
  },

  onShutdown : function(aData, aReason) {
    // XXX: Write user preferences.

    // Do the rest of the cleanup.
    this._observerService.removeObserver(this, ON_MODIFY_REQUEST);
    this._observerService.removeObserver(this, ON_EXAMINE_RESPONSE);
  },

  init : function() {
    // XXX: Load user preferences.

    // Inject all the user interface/event handling stuff.
    this._observerService.addObserver(this, ON_MODIFY_REQUEST, false);
    this._observerService.addObserver(this, ON_EXAMINE_RESPONSE, false);
  },

  observe : function(aSubject, aTopic, aData) {
    let uri, urlStr;
    var aChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
    var channelParams = loadContextGoodies(aChannel);
    var aBrowser = null;
    if (channelParams != null) {
      aBrowser = channelParams.gBrowser;
    }
    uri = aSubject.URI;
    urlStr = aSubject.URI.spec;

    if (ON_MODIFY_REQUEST == aTopic) {
      /* Examine our censorship cache to see if we know that the target host
       * requires circumvention.
       */
      if (this.isBlacklisted(uri)) {
        cancelRequest(aSubject);
        if (aBrowser != null) {
          this.fetchArchiveIs(aBrowser, urlStr);
        }
        return;
      }

      var host = uri.host;

      /* Reddit plans to track outbound clicks with some JavaScript
       * bullshit, where "plans" is currently "on hold due to lack of privacy
       * controls".  Stomp on that hard.
       */
      if (this._redditPrivacyFixes) {
        if (host == "events.redditmedia.com" ||
            host == "out.reddit.com") {
          cancelRequest(aSubject);
          return;
        }
      }

      /* imgur's gifv's use WebM and don't play with the security slider
       * set to sensible values.  Automatically rewrite if desired.
       */
      if (this._imgurGifvRewrite) {
        if (host.endsWith("imgur.com") && urlStr.toLowerCase().endsWith(".gifv")) {
          cancelRequest(aSubject);
          this.fetch(aBrowser, urlStr.slice(0, -1));
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
      } else if (CFPolicy.ALLOW_GLOBAL == this._cfPolicy) {
        return;
      } else {
        /* CloudFlare served the request, so handle it according to the
         * currently configured policy.
         */

        if (CFPolicy.DENY_GLOBAL == this._cfPolicy) {
          cancelRequest(aSubject);
          this.blacklist(uri);
          if (aBrowser != null) {
            this.fetchArchiveIs(aBrowser, urlStr);
          }
        } else {
          // Per site or automatic redirect on captcha.
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

  onPageLoad : function(aBrowser, aTrampoline, aEvent) {
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

    /* All encompasing container element. */
    var containerEle = doc.getElementsByClassName("cf-captcha-container");
    if (containerEle.length == 0) {
      return;
    }

    /* Form element. */
    let formEle;
    for (var i = 0; i < containerEle.length; i++) {
      formEle = containerEle[0].getElementsByClassName("challenge-form");
      if (formEle.length != 0) {
        break;
      }
      formEle = null;
    }
    if (!formEle) {
      return;
    }
    formEle = formEle[0];

    if (CFPolicy.DENY_CAPTCHA == this._cfPolicy) {
      this.fetchArchiveIs(aBrowser, doc.URL);
      return;
    }

    this.archiveNotificationBox(aBrowser, doc.URL);
  },

  archiveNotificationBox : function(aBrowser, aURL) {
    let notifyBox = aBrowser.getNotificationBox();
    let buttons = [];

    var buttonCb = function(aNotification, aButtonInfo, aEventTarget) {
      cfc.fetchArchiveIs(aBrowser, aURL);
    };

    let button = {
        isDefault: true,
        accessKey: "a",
        label: "Fetch from archive.is",
        callback: buttonCb,
        type: "", // If a popup, then must be: "menu-button" or "menu".
        popup: null
    };
    buttons.push(button);

    notifyBox.appendNotification("CloudFlare Captcha detected!",
                                 "cfc-archive-notification",
                                 "",
                                 notifyBox.PRIORITY_CRITICAL_HIGH, buttons,
                                 this.archiveNotificationCallback);
  },

  archiveNotificationCallback : function(aReason) {},

  fetch: function(aBrowser, aURL) {
    let flags = Ci.nsIWebNavigation.LOAD_FLAGS_IS_REFRESH;
    aBrowser.loadURIWithFlags(aURL, flags);
  },

  fetchArchiveIs : function(aBrowser, aURL) {
    this.fetch(aBrowser, "https://archive.is/timegate/" + aURL);
  },

  getURIDomain : function(aURI) {
    try {
      var urlDomain = this._tldService.getBaseDomain(aURI, 0);
      return urlDomain;
    } catch(ex) {
      return aURI.host;
    }
  },

  isWhitelisted : function(aURI) {
    return this._internalWhitelist.hasOwnProperty(this.getURIDomain(aURI)); // XXX: User whitelist.
  },

  isBlacklisted : function(aURI) {
    return this._blacklist.hasOwnProperty(this.getURIDomain(aURI));
  },

  blacklist : function(aURI) {
    this._blacklist[this.getURIDomain(aURI)] = true;
  },
};

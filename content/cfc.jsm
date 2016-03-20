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
Cu.import("resource://cfc/utils.jsm");

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

  //_cfPolicy : CFPolicy.DENY_GLOBAL,
  _cfPolicy : CFPolicy.PER_SITE,
  _internalWhitelist : {
    "archive.is" : true,
    "archive.li" : true,
  },
  _blacklist : {},

  onStartup : function(aData, aReason) {
    this._observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
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
    let host, url;
    var aChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
    var channelParams = loadContextGoodies(aChannel);
    host = aSubject.URI.host;
    url = aSubject.URI.spec;

    if (ON_MODIFY_REQUEST == aTopic) {
      /* Examine our censorship cache to see if we know that the target host
       * requires circumvention.
       */
      if (this.isBlacklisted(host)) {
        cancelRequest(aSubject);
        if (channelParams != null) {
          this.fetchArchiveIs(channelParams.gBrowser, url);
        }
      }
    } else if (ON_EXAMINE_RESPONSE == aTopic) {
      /* Skip further processing on whitelisted hosts. */
      if (this.isWhitelisted(host)) {
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
          this.blacklist(host);
          if (channelParams != null) {
            this.fetchArchiveIs(channelParams.gBrowser, url);
          }
        } else {
          // Per site or automatic redirect on captcha.
          if (channelParams != null && channelParams.gBrowser != null) {
            var trampoline;
            trampoline = function(aEvent) {
              cfc.onPageLoad(channelParams.gBrowser, trampoline, aEvent);
            };
            channelParams.gBrowser.addEventListener(ON_PAGE_LOAD, trampoline, false);
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

    /* Suppress further processing for things like xul:image (favicon). */
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

  fetchArchiveIs : function(aBrowser, aURL) {
    let flags = Ci.nsIWebNavigation.LOAD_FLAGS_IS_REFRESH;
    aBrowser.loadURIWithFlags("https://archive.is/timegate/" + aURL, flags);
  },

  isWhitelisted : function(aHost) {
    return this._internalWhitelist.hasOwnProperty(aHost); // XXX: User whitelist.
  },

  isBlacklisted : function(aHost) {
    return this._blacklist.hasOwnProperty(aHost);
  },

  blacklist : function(aHost) {
    this._blacklist[aHost] = true;
  },
};

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

var CFPolicy = {
  ALLOW_GLOBAL : 0,
  DENY_GLOBAL : 1,
  DENY_CAPTCHA : 2,
  PER_SITE : 3
};

function getURIDomain(aURI) {
  if (typeof aURI === "string") {
    aURI = new URL(aURI);
  }
  return aURI.host;
}

function getURIQuery(aURI) {
  var url = new URL(aURI);
  var b = {};
  var i;
  var p;
  var qs = (function(a) {
    if (a === "") {
      return {};
    }
    for (i = 0; i < a.length; i += 1) {
      p = a[i].split("=", 2);
      if (p.length == 1) {
        b[p[0]] = "";
      } else {
        b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
      }
    }
    return b;
  })(url.search.substr(1).split("&"));

  return qs;
}

var cfc = {
  _internalWhitelist: {
    "archive.is": true,
    "archive.li": true
  },
  _blacklist: {},
  _cflist: {},
  _prefs: {
    cfPolicy: 0,
    cfRewrite: true,
    imgurGifvRewrite: true,
    redditOutboundLinkTracking: true,
    viglinkTracking: true,
    twitterLinkTracking: true,
    bypassUselessHomepages: true
  },

  onStartup: function() {
    chrome.storage.local.get("cfcPrefs", function (res) {
      if ("cfcPrefs" in res && "cfPolicy" in res.cfcPrefs) {
        cfc._prefs = res.cfcPrefs;
      }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if ("cfcPrefs" in changes) {
        cfc._prefs = changes.cfcPrefs.newValue;
      }
    });

    chrome.runtime.onMessage.addListener(this.contentScriptListener.bind(this));

    chrome.webRequest.onBeforeRequest.addListener(this.cfcRequestRewriter.bind(this),
        {urls: ["<all_urls>"]},
        ["blocking"]);
    chrome.webRequest.onBeforeSendHeaders.addListener(this.cfcHomepageRewriter.bind(this),
        {
          urls: ["https://twitter.com/", "https://github.com/"],
          types: ["main_frame"]
        },
        ["blocking", "requestHeaders"]);
    chrome.webRequest.onHeadersReceived.addListener(this.cfcResponseRewriter.bind(this),
      {urls: ["<all_urls>"]},
      ["blocking", "responseHeaders"]);
  },

  contentScriptListener: function(message, sender, response) {
    if ("twitter" == message) {
      if ("twitterLinkTracking" in cfc._prefs) {
        response(cfc._prefs.twitterLinkTracking);
      } else {
        //TODO: default prefs.
        response(true);
      }
    } else if ("cloudflare" == message) {
      if (!("cfPolicy" in cfc._prefs)) {
        cfc._prefs.cfPolicy = CFPolicy.DENY_CAPTCHA;
        cfc._prefs.cfRewrite = false;
      }
      response({
        redirect: CFPolicy.DENY_CAPTCHA == cfc._prefs.cfPolicy,
        button: true,
        snark: cfc._prefs.cfRewrite
      });
    }
  },

  cfcRequestRewriter: function(requestDetails) {
    if (this.isBlacklisted(requestDetails.url)) {
      return {
        redirectUrl: "https://archive.is/timegate/" + requestDetails.url
      };
    }

    /* Skip further processing on whitelisted hosts. */
    if (this.isWhitelisted(requestDetails.url)) {
      return;
    }

    /* Various quality of life/privacy fixes unrelated to the great satan. */
    var domain = getURIDomain(requestDetails.url);
    //console.log("REQUEST REWRITER FOR DOMAIN: " + domain + " / URL:" + requestDetails.url);

    /* imgur's gifv is WebM.  The privacy slider on higher settings doesn't
     * play nice with this, so rewrite the link to request the animated GIF
     * transparently.
     */
    if (cfc._prefs.imgurGifvRewrite) {
      if (domain.endsWith("imgur.com") && requestDetails.url.toLowerCase().endsWith(".gifv")) {
        return {
          redirectUrl: requestDetails.url.slice(0, -1)
        };
      }
      if (domain.endsWith("imgur.com") &&
          requestDetails.url.toLowerCase().indexOf("gallery") == -1 &&
          requestDetails.url.toLowerCase().indexOf("/a/") == -1 &&
          !requestDetails.url.toLowerCase().endsWith("/") &&
          requestDetails.url.substr(requestDetails.url.lastIndexOf("/")).length >= 7 &&
          requestDetails.url.substr(requestDetails.url.lastIndexOf("/")).indexOf(".") == -1 ) {
        return {
          redirectUrl: requestDetails.url + ".jpg"
        };
      }
      if (domain.toLowerCase() == "gfycat.com") {
        return {
          redirectUrl: requestDetails.url.replace("gfycat.com", "giant.gfycat.com") + ".gif"
        }
      }
    }

    /* Kill reddit.com's outbound link tracking with fire. */
    if (cfc._prefs.redditOutboundLinkTracking) {
      if ("events.redditmedia.com" == domain || "out.reddit.com" == domain) {
        var query = getURIQuery(requestDetails.url);
        if ("url" in query) {
          return {redirectUrl: query.url};
        } else {
          return {cancel: true};
        }
      }
    }

    /* Kill viglink.com's tracking/referal code hijacking. */
    if (cfc._prefs.viglinkTracking) {
      if ("redirect.viglink.com" === domain) {
        return {
          redirectUrl: getURIQuery(requestDetails.url)["u"]
        };
      }
      if (domain.endsWith("viglink.com")) {
        return {cancel: true};
      }
    }
    return {cancel: false};
  },

  cfcHomepageRewriter: function(requestDetails) {
    /* Show useful twitter / github front page. */
    if (cfc._prefs.bypassUselessHomepages) {
      if (requestDetails.url === "https://twitter.com/" ||
          requestDetails.url === "https://github.com/") {
        //TODO: check cookies.
        if (! ("Cookie" in requestDetails.requestHeaders)) {
          chrome.tabs.update(requestDetails.tabId, {url: requestDetails.url + "search"});
          return {cancel: true};
        }
      }
    }
  },

  cfcResponseRewriter: function(responseDetails) {
    /* Check the response to see if the target site is hosted by
     * CloudFlare.
     *
     * As far as I can tell, this is indicated by two things:
     *  * The `Server` header being `cloudflare-nginx`.
     *  * The presence of a `CF-RAY` header (Always?).
     */
    var cfHosted = false;
    if (("Server" in responseDetails.responseHeaders &&
        "cloudflare-nginx" === responseDetails.responseHeaders.Server) ||
         ("CF-Ray" in responseDetails.responseHeaders &&
         null !== responseDetails.responseHeaders["CF-RAY"])) {
      cfHosted = true;
    }
    if (!cfHosted) {
      return;
    }
    this._cflist[getURIDomain(responseDetails.url)] = true;

    /* CloudFlare served the request, so handle it according to the
     * currently configured policy.
     */
    if (CFPolicy.DENY_GLOBAL == this._prefs.cfPolicy) {
      return {
        redirectUrl: "https://archive.is/timegate/" + responseDetails.url
      };
    }
  },

  isWhitelisted: function(aURI) {
    var domain = getURIDomain(aURI);
    if (this._internalWhitelist.hasOwnProperty(domain)) {
      return true;
    }
    return false;
  },

  isBlacklisted: function(aURI) {
    var domain = getURIDomain(aURI);
    if (CFPolicy.DENY_GLOBAL == this._prefs.cfPolicy && this._cflist.hasOwnProperty(domain)) {
      return true;
    }
    return this._blacklist.hasOwnProperty(domain);
  }
};

/* Call the object's main initialization point that does all the actual work. */
cfc.onStartup.call(cfc);

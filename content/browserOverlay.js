if ("undefined" == typeof(CFCChrome)) {
  var CFCChrome = {};

  /* Whitelist the archive.is infrastructure. */
  CFCChrome.globalWhiteList = {};
  CFCChrome.globalWhiteList['archive.is'] = true
  CFCChrome.globalWhiteList['archive.li'] = true

  /* Initialize the blacklist cache. */
  CFCChrome.blackList = {};

  /* Initialize the default preferences. */
  CFCChrome.allowGlobally = true;

  /* XXX: Load preferences from persistent storage. */

};

/* Global routines. :( */

CFCChrome.BrowserOverlay = {
  _observerService : null,

  init : function() {
    this._observerService = Components.classes["@mozilla.org/observer-service;1"].
       getService(Components.interfaces.nsIObserverService);
    this._observerService.addObserver(this, "http-on-modify-request", false);
    this._observerService.addObserver(this, "http-on-examine-response", false);
  },

  uninit : function() {
    this._observerService.removeObserver(this, "http-on-modify-request");
    this._observerService.removeObserver(this, "http-on-examine-response");
  },

  observe : function(aSubject, aTopic, aData) {
    let url, host;

    aSubject.QueryInterface(Components.interfaces.nsIHttpChannel);
    host = aSubject.URI.host;
    url = aSubject.URI.spec;

    if ("http-on-modify-request" == aTopic) {
      /* Examine our censorship cache to see if we know that the target host
       * requires circumvention.
       */
      if (this.isBlackListed(host)) {
        this.redispatch(aSubject, url);
      }
    } else if ("http-on-examine-response" == aTopic) {
      /* Skip further processing on whitelisted hosts. */
      if (this.isWhiteListed(host)) {
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
        if (!this.isWhiteListed(host) &&
            ("cloudflare-nginx" == aSubject.getResponseHeader("Server") ||
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
      } else if (!CFCChrome.allowGlobally) {
        /* CloudFlare served the response to us, so cancel the request, and
         * re-dispatch it to archive.is.
        */
        this.blackList(host);
        this.redispatch(aSubject, url);
      } else {
        /* Install the onPageLoad handler to see if we got a captcha, so
         * that an override can be injected.
         */
        if (gBrowser) {
          gBrowser.addEventListener("DOMContentLoaded", CFCChrome.BrowserOverlay.onPageLoad, false);
        }
      }
    }
  },

  onPageLoad : function(aEvent) {
    var doc = aEvent.originalTarget;
    var win = doc.defaultView;


    /* Remove the onPageLoad handler so that multiple injections aren't done
     * when the page pulls in other components of the captcha.
     */
    gBrowser.removeEventListener("DOMContentLoaded", CFCChrome.BrowserOverlay.onPageLoad);

    /* Suppress further processing for things like xul:image (favicon). */
    if (doc.nodeName != "#document") {
      return;
    }

    /* Only want to peek into the DOM and attempt to inject on a captcha. */
    if (doc.title != "Attention Required! | CloudFlare") {
      return;
    }

    /* Reach into the DOM to find our injection point. */

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

    /* Sanity-check to ensure we haven't injected our button yet. */
    var buttonEle = formEle.getElementsByClassName("cfc-button");
    if (buttonEle.length > 0) {
      return;
    }

    /* Inject the "Fetch archived copy" button. */
    var injectPoint = formEle.parentNode;
    var buttonEle = CFCChrome.BrowserOverlay.buildButton(doc);
    injectPoint.insertBefore(buttonEle, formEle);
  },

  buildButton : function(aDoc) {
    /* XXX: Make the button look nicer. */
    var button = aDoc.createElement("button");
    button.setAttribute("style", "width:100%; margin: 10px 0px");
    var buttonTxt = aDoc.createTextNode("cfc: Fetch archived copy");
    button.appendChild(buttonTxt);
    var div = aDoc.createElement("div");
    div.setAttribute("style", "width: 302px");
    div.setAttribute("class", "cfc-button");
    div.appendChild(button);
    button.addEventListener("click", function() { CFCChrome.BrowserOverlay.onButtonPressed(aDoc.URL); }, true);
    return div;
  },

  onButtonPressed : function(aURL) {
    this.dispatch(aURL);
  },

  dispatch : function(aURL) {
    openUILinkIn("https://archive.is/timegate/" + aURL, "current");
  },

  redispatch : function(aSubject, aURL) {
    aSubject.cancel(Components.results.NS_BINDING_ABORTED);
    this.dispatch(aURL);
  },

  isWhiteListed : function(aHost) {
    return CFCChrome.globalWhiteList.hasOwnProperty(aHost);
  },

  isBlackListed : function(aHost) {
    return CFCChrome.blackList.hasOwnProperty(aHost);
  },

  blackList : function(aHost) {
    CFCChrome.blackList[aHost] = true;
  }
};

window.addEventListener(
  "load", function() { CFCChrome.BrowserOverlay.init(); }, false);
window.addEventListener(
  "unload", function() { CFCChrome.BrowserOverlay.uninit(); }, false);


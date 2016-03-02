if ("undefined" == typeof(CFCChrome)) {
  var CFCChrome = {};

  /* Whitelist the archive.is infrastructure. */
  CFCChrome.globalWhiteList = {};
  CFCChrome.globalWhiteList['archive.is'] = true
  CFCChrome.globalWhiteList['archive.li'] = true

  /* Initialize the blacklist cache. */
  CFCChrome.blackList = {};
};

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
      /* Check the response to see if the target site is hosted by
       * CloudFlare.
       *
       * As far as I can tell, this is indicated by two things:
       *  * The `Server` header being `cloudflare-nginx`.
       *  * The presence of a `CF-RAY` header (Always?).
       */

      try {
        if (!this.isWhiteListed(host) &&
            ("cloudflare-nginx" == aSubject.getResponseHeader("Server") ||
             null != aSubject.getResponseHeader("CF-RAY"))) {
          /* CloudFlare served the response to us, so cancel the request, and
           * re-dispatch it to archive.is.
           */

          this.blackList(host);
          this.redispatch(aSubject, url);
        }
      } catch (ex) {

      }
    }
  },

  redispatch : function(aSubject, aURL) {
    aSubject.cancel(Components.results.NS_BINDING_ABORTED);
    openUILinkIn("https://archive.is/timegate/" + aURL, "current");
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


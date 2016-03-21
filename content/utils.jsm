/*
 * utils.jsm - various utilities shamelessly stolen from the Mozilla
 * documentation.
 *
 * All credit to original authors.
 */

var EXPORTED_SYMBOLS = [ "loadContextGoodies" ];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

// Taken from: https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser
// And cleaned up, corrected by yours truely.

// This function gets the contentWindow and other good stuff from loadContext of
// httpChannel.
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

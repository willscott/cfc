var defaultPrefs = {
  cfPolicy: 0,
  cfRewrite: true,
  imgurGifvRewrite: true,
  redditOutboundLinkTracking: true,
  viglinkTracking: true,
  twitterLinkTracking: true,
  bypassUselessHomepages: true
};

function saveOptions(e) {
  var prefs = defaultPrefs;
  Object.keys(prefs).forEach(function (pref) {
    var selector = document.querySelector("#" + pref);
    if (selector.type === "checkbox") {
      prefs[pref] = selector.checked ? true : false;
    } else {
      prefs[pref] = selector.value;
    }
  });

  chrome.storage.local.set({
    cfcPrefs: prefs
  });
}

function restoreOptions() {
  chrome.storage.local.get('cfcPrefs', function (res) {
    Object.keys(defaultPrefs).forEach(function (pref) {
      var selector = document.querySelector("#" + pref);
      var value = defaultPrefs[pref];
      if ("cfcPrefs" in res && typeof(res.cfcPrefs[pref]) !== undefined) {
        value = res.cfcPrefs[pref];
      }
      if (selector.type == "checkbox") {
        selector.checked = value;
      } else {
        selector.value = value;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

chrome.runtime.sendMessage("twitter", function(response) {
  if (response) {
    var tweetdeckLinks = document.querySelectorAll("a[data-full-url]");
    var i;
    for (i = 0; i < tweetdeckLinks.length; i += 1) {
      tweetdeckLinks[i].href = tweetdeckLinks[i].getAttribute("data-full-url");
    }

    var searchLinks = document.querySelectorAll("a[data-expanded-url]");
    for (i = 0; i < searchLinks.length; i += 1) {
      searchLinks[i].href = searchLinks[i].getAttribute("data-expanded-url");
    }
  }
});

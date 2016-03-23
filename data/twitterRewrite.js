if (self.options["active"]) {
  var tweetdeckLinks = document.querySelectorAll("a[data-full-url]");
  for (var i = 0; i < tweetdeckLinks.length; i += 1) {
    tweetdeckLinks[i].href = tweetdeckLinks[i].getAttribute("data-full-url");
  }
  var searchLinks = document.querySelectorAll("a[data-expanded-url]")
  for (var i = 0; i < searchLinks.length; i += 1) {
    searchLinks[i].href = searchLinks[i].getAttribute("data-expanded-url");
  }
}

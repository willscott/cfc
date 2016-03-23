self.port.on("cfRewrite", function(params) {
  if (document.title != "Attention Required! | CloudFlare") {
    return;
  }

  var container = document.body.querySelector(".cf-captcha-container");
  if (container == null) {
    return;
  }
  var formEle = container.querySelector(".challenge-form");
  if (formEle == null) {
    return;
  }

  if (params["redirect"]) {
    window.location.replace("https://archive.is/timegate/" + window.location.href);
    return;
  }

  if (params["button"]) {
    buttonEle = formEle.querySelector("cfc-button");
    if (buttonEle == null) {
      var injectPoint = formEle.parentNode;
      buttonEle = document.createElement("button");
      buttonEle.setAttribute("style", "width:100%; margin: 10px 0px; background-color: #66cc44; display: inline-block");
      var buttonTxt = document.createTextNode("Fetch from archive.is");
      buttonEle.appendChild(buttonTxt);
      var div = document.createElement("div");
      div.setAttribute("style", "width: 302px");
      div.setAttribute("class", "cfc-button");
      div.appendChild(buttonEle);
      buttonEle.addEventListener("click", function() {
        window.location.replace("https://archive.is/timegate/" + window.location.href);
      });
      injectPoint.insertBefore(div, formEle);
    }
  }

  if (params["snark"]) {
    var whyEle = document.querySelector("p[data-translate='why_captcha_detail']");
    if (whyEle != null) {
      // Strip out the data-translate tag to prevent the page script from
      // attempting to localize my improved "Why" explanation.
      whyEle.removeAttribute("data-translate");
      whyEle.innerHTML = "Because despite being a huge company with tons of resources, we don't really give a shit about Tor users, still think that IP addresses are good identifiers despite the prevalence of NATs, and will only make token efforts to improve our primitive IP address based reputation system whenever there is negative PR associated with censorship.";
  }

    var avEle = document.querySelector("p[data-translate='resolve_captcha_antivirus']");
    if (avEle != null) {
      avEle.removeAttribute("data-translate");
      avEle.innerHTML = "Ask the site operator to switch to a CDN network that does not hate privacy.";
    }

    var netEle = document.querySelector("p[data-translate='resolve_captcha_network']");
    if (netEle != null) {
      netEle.removeAttribute("data-translate");
      netEle.innerHTML = "Ask the site opererator to configure the CloudFlare settings to <a href=\"https://support.cloudflare.com/hc/en-us/articles/203306930\">whitelist access from the Tor Network</a>.";
    }
  }
});

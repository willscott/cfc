function isCloudFlareCaptcha(doc) {
  if (doc.title != "Attention Required! | CloudFlare") {
    return false;
  }

  var container = doc.body.querySelector(".cf-captcha-container");
  if (container == null) {
    return false;
  }
  var formEle = container.querySelector(".challenge-form");
  if (formEle == null) {
    return false;
  }

  return true;
}

if (isCloudFlareCaptcha(document)) {
  // Rewrite the captcha information to match reality.

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

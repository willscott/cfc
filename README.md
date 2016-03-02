### cfc - Improve the Tor Browser user experience
#### Yawning Angel (yawning at schwanenlied dot me)

cfc is a Firefox addon that attempts to improve the Tor Browser user
experience.  It is intended as a proof of concept with a fairly substantial
reduction in privacy/anonymity and MUST NOT BE USED BY AT RISK USER BASES.

Notes:

 * It's been years since I've subjected myself to JavaScript, and this is
   the first Firefox addon I've written.  Code quality not guaranteed.

 * If XUL is ever deprecated, this will break hard.  I could have used the
   SDK for some future proofing, but accessing the Component object is
   required and the documentation warned against it, and the SDK requires
   Node.js which is the technology equivalent of prostate cancer.

 * The first access to a site will incur minor additional network overhead
   on a per-session basis.  I have plans on how to mitigate this without
   persisting history to disk, that will also enable a few nifty features.

 * The circumvention method used defeats Tor Browser's built in session
   isolation.  Fixing this issue correctly requires a Tor Browser patch.
   You have been warned, twice.

 * Untested on Wintendos and Macintoys.  I do not have such abominations,
   however the code should work as it is portable.

 * I actually have nothing against Cloudflare, and have had many a interesting
   conversation with talented engineers working there, and I'm absolutely
   appaled at the amount of hate and vitrol spewed their way in our trac
   ticket.

 * The name was chosen because it punches holes in censorship/blocking like
   chlorofluorocarbons punch holes in the ozone layer, and any resemblance
   to "CloudFlare Fucking Captcha" is entirely coincidental.


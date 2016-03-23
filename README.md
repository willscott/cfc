### cfc - Improve the Tor Browser user experience
#### Yawning Angel (yawning at schwanenlied dot me)

TLDR:

> @CloudFlare website users have the choice to allow (or block)
> what they want to. (https://archive.is/O68bX)

About:

cfc is a Firefox addon that attempts to improve the Tor Browser user
experience.  Primarily by interpreting CloudFlare as damage and routing
around it.

It is intended as a proof of concept with some features incurring a
fairly substantial reduction in privacy/anonymity and MUST NOT BE USED BY
AT RISK USER BASES.

Notes:

 * The circumvention method used defeats Tor Browser's built in session
   isolation.  Fixing this issue correctly requires a Tor Browser patch.
   You have been warned, twice.

 * This is a bastard combination of a bootstrapped (restartless) addon,
   and SDK calls.  It however does use Content Scripts, so it may survive
   the transition to e10s.

 * The first access to a site will incur minor additional network overhead
   on a per-session basis.

 * The name was chosen because it punches holes in censorship/blocking like
   chlorofluorocarbons punch holes in the ozone layer, and any resemblance
   to "CloudFlare Fucking Captcha" is entirely coincidental.

 * It's been years since I've subjected myself to JavaScript, and this is
   the first Firefox addon I've written.  Code quality not guaranteed.

 * Untested on Wintendos and Macintoys.  I do not have such abominations,
   however the code should work as it is portable.


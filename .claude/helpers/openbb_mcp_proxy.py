"""Run openbb-mcp with aiohttp sessions that honor HTTPS_PROXY / NO_PROXY.

Cloud sessions reach the internet only through the agent proxy in
$HTTPS_PROXY. Some OpenBB providers (Deribit among them) open a bare
aiohttp.ClientSession(), which ignores proxy env vars and tries to resolve
hosts directly, so every request fails. Defaulting trust_env=True fixes that
without patching site-packages. Arguments pass through to openbb-mcp.
"""

import sys

import aiohttp

_init = aiohttp.ClientSession.__init__


def _init_trust_env(self, *args, **kwargs):
    kwargs.setdefault("trust_env", True)
    _init(self, *args, **kwargs)


aiohttp.ClientSession.__init__ = _init_trust_env

from openbb_mcp_server.main import main  # noqa: E402

if __name__ == "__main__":
    sys.argv[0] = "openbb-mcp"
    sys.exit(main())

"""The live-token embed, shared by both papers.

One copy of the chain call, the decode and the frame, parameterised by the
token it points at. Duplicating this per paper is how the two would drift.

`auto=True` makes the block load itself when it scrolls into view instead of
waiting for a press. It does NOT load on page load: the render is a ~31M gas
read returning about 580 KB, and the frame runs a real emulator once it
arrives, so a reader who never reaches the section should not pay for it in
bandwidth, CPU or battery. The press path stays exactly as it was - auto mode
fires the same run() - so the failure state, the retry and the Etherscan
fallback are unchanged, and turning it off is one argument.
"""
import json
from registry import RPCS


TEMPLATE = """<figure class="token-live" id="token-live">
  <figcaption class="token-head">
    <span class="token-label">THE LIVE TOKEN</span>
    <span class="token-note">{NOTE}</span>
  </figcaption>
  <div class="token-stage" id="token-stage">
    <button type="button" class="token-load" id="token-load"{LOAD_ATTRS}>{LOAD_LABEL}</button>
    <p class="token-sub" id="token-sub">{BLURB}</p>
  </div>
  <p class="token-foot">{FOOT}</p>
</figure>
<script>
(function () {
  var AUTO = {AUTO};
  var TOKEN = "{ADDRESS}";
  var SELECTOR = "0xc87b56dd";                        // tokenURI(uint256)
  var ARG = "{TOKEN_ID_HEX}";                     // the token id, 32 bytes
  var RPCS = {RPCS};

  var stage = document.getElementById("token-stage");
  var btn = document.getElementById("token-load");
  var sub = document.getElementById("token-sub");
  var say = function (t) { sub.textContent = t; };

  // ABI-decode one returned string: [offset][length][bytes]
  function decodeString(hex) {
    var b = hex.slice(2);
    var len = parseInt(b.slice(64, 128), 16);
    var body = b.slice(128, 128 + len * 2);
    var out = new Uint8Array(len);
    for (var i = 0; i < len; i++) out[i] = parseInt(body.substr(i * 2, 2), 16);
    return new TextDecoder().decode(out);
  }

  // a base64 data: URI to a Blob, so nothing depends on data-URI length limits
  function toBlob(uri) {
    var comma = uri.indexOf(",");
    var type = uri.slice(5, comma).split(";")[0] || "text/plain";
    var bin = atob(uri.slice(comma + 1));
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: type });
  }

  function call(rpc) {
    return fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        // eth_call with no gas set usually defaults to the block gas limit, which
        // is well under what a render this size needs. Ask explicitly; a provider
        // will still refuse above its own cap, but some caps are higher than the
        // block limit and this is the only way to reach them.
        params: [{ to: TOKEN, data: SELECTOR + ARG, gas: "0x5F5E100" }, "latest"]
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "the provider refused the call");
      if (!j.result || j.result === "0x") throw new Error("the provider returned nothing");
      return j.result;
    });
  }

  function run() {
    btn.disabled = true;
    btn.textContent = "READING THE CHAIN…";
    say("Calling tokenURI on mainnet. The full render is about 31 million gas as a read, so give it a few seconds.");

    var p = Promise.reject();
    RPCS.forEach(function (rpc) { p = p.catch(function () { return call(rpc); }); });

    p.then(function (hex) {
      return toBlob(decodeString(hex)).text();
    }).then(function (jsonText) {
      var meta = JSON.parse(jsonText);
      if (!meta.animation_url) throw new Error("the token returned no animation_url");
      var frame = document.createElement("iframe");
      frame.className = "token-frame";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("title", "{FRAME_TITLE}");
      frame.src = URL.createObjectURL(toBlob(meta.animation_url));
      stage.innerHTML = "";
      stage.appendChild(frame);
    })["catch"](function (e) {
      btn.disabled = false;
      btn.textContent = "TRY AGAIN";
      say("No public provider would serve this read (" + ((e && e.message) || "unknown error") +
          "). Rendering this token is a very large call, and free providers cap how much " +
          "work a read may do. Nothing is wrong with the token: it renders in full on " +
          "Etherscan and on marketplaces, which do not use those caps.");
      if (!document.getElementById("token-out")) {
        var a = document.createElement("a");
        a.id = "token-out";
        a.className = "token-out";
        a.href = "https://etherscan.io/address/" + TOKEN + "#readContract";
        a.target = "_blank"; a.rel = "noopener";
        a.textContent = "OPEN THE TOKEN ON ETHERSCAN";
        stage.appendChild(a);
      }
    });
  }

  btn.addEventListener("click", run);

  // Auto mode: start when the figure is near the viewport, once. rootMargin
  // buys a head start so the read is usually done by the time it is actually
  // on screen. Without IntersectionObserver, just run - those browsers are
  // rare and a working frame beats a correct optimisation.
  if (AUTO) {
    var fig = document.getElementById("token-live");
    if (window.IntersectionObserver && fig) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { io.disconnect(); run(); return; }
        }
      }, { rootMargin: "400px 0px" });
      io.observe(fig);
    } else {
      run();
    }
  }
})();
</script>
"""


def embed(address, token_id, frame_title, note, blurb, foot, auto=False):
    """The figure and its script, for one token.

    auto=True loads it on scroll instead of on a press. Set it back to False
    and rebuild to restore the button; nothing else changes.
    """
    return (TEMPLATE
            .replace("{AUTO}", "true" if auto else "false")
            .replace("{RPCS}", json.dumps(list(RPCS)))
            .replace("{LOAD_ATTRS}", " disabled" if auto else "")
            .replace("{LOAD_LABEL}",
                     "READING THE CHAIN\u2026" if auto else "LOAD THE TOKEN")
            .replace("{ADDRESS}", address)
            .replace("{TOKEN_ID_HEX}", format(token_id, "064x"))
            .replace("{FRAME_TITLE}", frame_title)
            .replace("{NOTE}", note)
            .replace("{BLURB}", blurb)
            .replace("{FOOT}", foot))

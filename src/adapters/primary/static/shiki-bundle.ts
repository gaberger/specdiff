import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import json from 'shiki/langs/json.mjs';
import rosePineDawn from 'shiki/themes/rose-pine-dawn.mjs';

export async function createJsonHighlighter() {
  return createHighlighterCore({
    themes: [rosePineDawn],
    langs: [json],
    engine: createJavaScriptRegexEngine(),
  });
}

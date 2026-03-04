(function () {
  "use strict";

  var SUPPORTED = ["en", "zh-CN", "es", "hi", "ar", "pt", "fr", "ru", "id", "ja"];
  var RTL_LANGS = { ar: true };
  var DEFAULT_LANG = "en";
  var STORAGE_KEY = "preferredLanguage";
  var LOCALE_VERSION = "20260304-1";

  function mapToSupportedLang(langTag) {
    var tag = String(langTag || "").toLowerCase();
    if (!tag) {
      return "";
    }
    if (tag.indexOf("zh") === 0) return "zh-CN";
    if (tag.indexOf("pt") === 0) return "pt";
    if (tag.indexOf("es") === 0) return "es";
    if (tag.indexOf("hi") === 0) return "hi";
    if (tag.indexOf("ar") === 0) return "ar";
    if (tag.indexOf("fr") === 0) return "fr";
    if (tag.indexOf("ru") === 0) return "ru";
    if (tag.indexOf("id") === 0) return "id";
    if (tag.indexOf("ja") === 0) return "ja";
    if (tag.indexOf("en") === 0) return "en";
    return "";
  }

  function getStoredLanguage() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) {
        return saved;
      }
    } catch (e) {
      console.warn("Unable to read saved language:", e);
    }
    return "";
  }

  function getLanguageFromQuery() {
    try {
      var url = new URL(window.location.href);
      var fromQuery = url.searchParams.get("lang");
      if (fromQuery && SUPPORTED.indexOf(fromQuery) !== -1) {
        return fromQuery;
      }
    } catch (e) {
      console.warn("Unable to read language from URL:", e);
    }
    return "";
  }

  function saveLanguage(lang) {
    try {
      if (SUPPORTED.indexOf(lang) !== -1) {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch (e) {
      console.warn("Unable to save language:", e);
    }
  }

  function clearSavedLanguage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Unable to clear saved language:", e);
    }
  }

  function detectPreferredLanguage() {
    var fromQuery = getLanguageFromQuery();
    if (fromQuery) {
      return fromQuery;
    }

    var saved = getStoredLanguage();
    if (saved) {
      return saved;
    }

    var candidates = [];

    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      candidates = candidates.concat(navigator.languages);
    }

    if (navigator.language) {
      candidates.push(navigator.language);
    }

    for (var i = 0; i < candidates.length; i += 1) {
      var matched = mapToSupportedLang(candidates[i]);
      if (matched) {
        return matched;
      }
    }

    return DEFAULT_LANG;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function localeFileUrl(lang) {
    var url = new URL("locales/" + encodeURIComponent(lang) + ".json", window.location.href);
    url.searchParams.set("v", LOCALE_VERSION);
    return url.toString();
  }

  function fetchLocale(lang) {
    return fetch(localeFileUrl(lang), { cache: "no-cache" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load locale: " + lang);
      }
      return response.json();
    });
  }

  function mergeAttributes(baseAttrs, localeAttrs) {
    var merged = {};
    var attr;

    baseAttrs = baseAttrs || {};
    localeAttrs = localeAttrs || {};

    for (attr in baseAttrs) {
      if (Object.prototype.hasOwnProperty.call(baseAttrs, attr)) {
        merged[attr] = Object.assign({}, baseAttrs[attr]);
      }
    }

    for (attr in localeAttrs) {
      if (!Object.prototype.hasOwnProperty.call(localeAttrs, attr)) {
        continue;
      }
      if (!merged[attr]) {
        merged[attr] = {};
      }
      Object.assign(merged[attr], localeAttrs[attr]);
    }

    return merged;
  }

  function applyTextMap(textMap) {
    if (!textMap) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(textMap, "__TITLE__")) {
      document.title = textMap.__TITLE__;
    }

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node || !node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        var parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }

        // Rich-text blocks are translated through template keys to keep link/order natural.
        if (parent.closest && parent.closest("[data-i18n-template-key]")) {
          return NodeFilter.FILTER_REJECT;
        }

        var tag = parent.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach(function (node) {
      var raw = node.nodeValue;
      var key = normalizeText(raw);

      if (!key || !Object.prototype.hasOwnProperty.call(textMap, key)) {
        return;
      }

      var translated = textMap[key];
      if (typeof translated !== "string") {
        return;
      }

      var leading = (raw.match(/^\s*/) || [""])[0];
      var trailing = (raw.match(/\s*$/) || [""])[0];
      node.nodeValue = leading + translated + trailing;
    });
  }

  function applyAttributeMap(attributeMap) {
    if (!attributeMap) {
      return;
    }

    Object.keys(attributeMap).forEach(function (attrName) {
      var textMap = attributeMap[attrName];
      if (!textMap) {
        return;
      }

      document.querySelectorAll("[" + attrName + "]").forEach(function (element) {
        var current = normalizeText(element.getAttribute(attrName));
        if (!current || !Object.prototype.hasOwnProperty.call(textMap, current)) {
          return;
        }

        element.setAttribute(attrName, textMap[current]);
      });
    });
  }

  function applyTemplateMap(templateMap) {
    if (!templateMap) {
      return;
    }

    document.querySelectorAll("[data-i18n-template-key]").forEach(function (element) {
      var key = element.getAttribute("data-i18n-template-key");
      if (!key || !Object.prototype.hasOwnProperty.call(templateMap, key)) {
        return;
      }

      var template = templateMap[key];
      if (typeof template !== "string") {
        return;
      }

      var counters = { a: 0, code: 0, span: 0, strong: 0, em: 0 };
      element.querySelectorAll("a, code, span, strong, em").forEach(function (node) {
        var tag = node.tagName.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(counters, tag)) {
          return;
        }

        var idx = counters[tag];
        var placeholder = "{" + tag + idx + "}";
        template = template.split(placeholder).join(node.outerHTML);
        counters[tag] = idx + 1;
      });

      if (/\{(?:a|code|span|strong|em)\d+\}/.test(template)) {
        console.warn("Template placeholders unresolved for key:", key);
        return;
      }

      element.innerHTML = template;
    });
  }

  function applyLocaleMeta(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS[lang] ? "rtl" : "ltr";
  }

  function setupLanguageSwitcher(initialLang) {
    var selector = document.getElementById("language-switcher");
    if (!selector) {
      return;
    }

    if (selector.dataset.bound === "true") {
      return;
    }

    var fromQuery = getLanguageFromQuery();
    var saved = getStoredLanguage();
    selector.value = fromQuery || saved || initialLang || "auto";
    if (selector.value !== "auto" && SUPPORTED.indexOf(selector.value) === -1) {
      selector.value = "auto";
    }

    selector.addEventListener("change", function () {
      var selected = String(selector.value || "");
      var url = new URL(window.location.href);

      if (selected === "auto") {
        clearSavedLanguage();
        url.searchParams.delete("lang");
      } else if (SUPPORTED.indexOf(selected) !== -1) {
        saveLanguage(selected);
        url.searchParams.set("lang", selected);
      } else {
        clearSavedLanguage();
        url.searchParams.delete("lang");
      }

      window.location.href = url.toString();
    });

    selector.dataset.bound = "true";
  }

  function initI18n() {
    var selected = detectPreferredLanguage();
    setupLanguageSwitcher(selected);

    return fetchLocale(DEFAULT_LANG)
      .then(function (baseLocale) {
        if (selected === DEFAULT_LANG) {
          return { base: baseLocale, locale: baseLocale, selected: DEFAULT_LANG };
        }

        return fetchLocale(selected)
          .then(function (selectedLocale) {
            return { base: baseLocale, locale: selectedLocale, selected: selected };
          })
          .catch(function () {
            return { base: baseLocale, locale: baseLocale, selected: DEFAULT_LANG };
          });
      })
      .then(function (bundle) {
        var base = bundle.base || {};
        var locale = bundle.locale || {};
        var lang = locale.lang || bundle.selected || DEFAULT_LANG;

        if (SUPPORTED.indexOf(lang) === -1) {
          lang = DEFAULT_LANG;
        }

        var mergedTexts = Object.assign({}, base.texts || {}, locale.texts || {});
        var mergedAttributes = mergeAttributes(base.attributes || {}, locale.attributes || {});
        var mergedMessages = Object.assign({}, base.messages || {}, locale.messages || {});
        var mergedTemplates = Object.assign({}, base.templates || {}, locale.templates || {});

        window.__i18nMessages = mergedMessages;
        applyLocaleMeta(lang);
        applyTextMap(mergedTexts);
        applyAttributeMap(mergedAttributes);
        applyTemplateMap(mergedTemplates);
      })
      .catch(function (error) {
        console.warn("i18n initialization failed:", error);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initI18n);
  } else {
    initI18n();
  }
})();

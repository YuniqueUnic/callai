import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enAlarms from "./locales/en/alarms.json";
import enLogs from "./locales/en/logs.json";
import enSettings from "./locales/en/settings.json";
import enAi from "./locales/en/ai.json";
import enPlugins from "./locales/en/plugins.json";
import zhCommon from "./locales/zh-CN/common.json";
import zhAlarms from "./locales/zh-CN/alarms.json";
import zhLogs from "./locales/zh-CN/logs.json";
import zhSettings from "./locales/zh-CN/settings.json";
import zhAi from "./locales/zh-CN/ai.json";
import zhPlugins from "./locales/zh-CN/plugins.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        alarms: enAlarms,
        logs: enLogs,
        settings: enSettings,
        ai: enAi,
        plugins: enPlugins,
      },
      "zh-CN": {
        common: zhCommon,
        alarms: zhAlarms,
        logs: zhLogs,
        settings: zhSettings,
        ai: zhAi,
        plugins: zhPlugins,
      },
    },
    fallbackLng: "zh-CN",
    defaultNS: "common",
    ns: ["common", "alarms", "logs", "settings", "ai", "plugins"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;

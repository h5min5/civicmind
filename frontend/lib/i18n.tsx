"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translateTexts } from "@/lib/api";

export type Locale = "en" | "hi" | "mr";

const STORAGE_KEY = "civicmind.locale";

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: {
    "viewLanguage": "View language",
    "nav.report": "Report",
    "nav.map": "Map",
    "nav.archive": "Archive",
    "nav.notices": "Notices",
    "nav.assistant": "Assistant",
    "nav.account": "Account",
    "nav.command": "Command",
    "nav.overview": "Overview",
    "nav.incidents": "Incidents",
    "nav.analytics": "Analytics",
    "nav.hotspots": "Hotspots",
    "nav.copilot": "Copilot",
    "nav.evaluation": "Evaluation",
    "nav.audit": "Audit",
    "nav.reports": "Reports",
    "nav.accounts": "Accounts",
    "hero.eyebrow": "Mumbai civic intelligence",
    "hero.title": "The street, understood.",
    "hero.body": "Describe a problem in English, Hindi, or Marathi, add a photo if you have one, and pin the place. CivicMind checks that the report is real, groups it with the same incident nearby, and routes it to the right department.",
    "hero.file": "File a complaint",
    "hero.map": "Explore the map",
    "stat.complaints": "Live complaints",
    "stat.incidents": "Live incidents",
    "stat.resolved": "Resolved",
    "stat.archive": "Archive",
    "form.eyebrow": "New report",
    "form.title": "File a civic complaint",
    "form.what": "What is happening?",
    "form.speak": "Speak",
    "form.stop": "Stop listening",
    "form.detecting": "Detecting language…",
    "form.voiceHint": "Speak in English, Hindi, or Marathi. If that is not the language selected above, the chip changes to the language that was heard.",
    "form.photo": "Photo, optional",
    "form.take": "Take photo",
    "form.upload": "Upload photo",
    "form.photoHint": "A photo is checked against the text. A selfie, a meal, or an unrelated picture is rejected.",
    "form.location": "Location",
    "form.pinHint": "The name is the nearest street. Tap the map if that street is wrong.",
    "form.myLocation": "Use my location",
    "form.finding": "Finding you…",
    "form.submit": "Submit complaint",
    "form.checking": "Checking the complaint…",
    "form.remove": "Remove",
    "form.heard": "Heard {language}, so that language was selected.",
    "lang.en": "English",
    "lang.hi": "Hindi",
    "lang.mr": "Marathi",
    "records.eyebrow": "Already reported",
    "records.title": "Recent complaints and incidents",
    "records.complaints": "Complaints",
    "records.incidents": "Incidents",
    "records.search": "Search",
    "records.apply": "Apply filters",
    "records.searching": "Searching…",
    "records.words": "Citizen's words",
    "records.emptyComplaints": "No complaints match these filters yet.",
    "records.emptyIncidents": "No incidents match these filters yet.",
    "records.note": "Authority note",
    "records.status": "Status",
    "records.area": "Area",
    "records.anyArea": "Any area",
    "records.category": "Category",
    "records.any": "Any",
    "records.severity": "Severity",
    "records.issueType": "Issue type",
    "records.from": "From",
    "records.to": "To",
    "records.near": "Near my location",
    "records.locateHint": "Tap Use my location before searching nearby.",
    "map.label": "Complaints in Mumbai",
    "map.hint": "Pan and zoom across Mumbai. Hover or tap a point to read the issue.",
    "records.radius": "Radius",
    "report.english": "Stored report, written in English",
    "notices.eyebrow": "Official notices",
    "notices.title": "Notice board",
    "notices.body": "Warnings, closures, advisories, and circulars issued by the civic desks. A withdrawn notice leaves this board.",
    "notices.all": "All",
    "notices.warnings": "Warnings",
    "notices.closures": "Closures",
    "notices.advisories": "Advisories",
    "notices.circulars": "Circulars",
    "notices.loading": "Loading the notice board…",
    "notices.empty": "No active notice is posted.",
    "notices.stripEyebrow": "Notice board",
    "notices.stripTitle": "Warnings and closures in force",
    "notices.open": "Open the notice board",
    "notices.pdf": "Open the PDF",
    "notices.doc": "Open the document",
    "desk.eyebrow": "Ten departments",
    "desk.title": "Routed to the desk that owns the problem",
    "features.eyebrow": "The platform",
    "features.title": "What CivicMind does",
    "track.title": "Track a complaint",
    "track.body": "Use the CM- code from your report or the INC- code of the incident. The report below is the English version of what was filed.",
    "track.code": "Tracking code",
    "track.lookup": "Look up",
    "track.looking": "Looking up…",
    "track.timeline": "Timeline",
    "track.reports": "Reports",
    "account.guest": "Your civic record",
    "account.in": "Sign in",
    "account.up": "Create account",
    "assistant.title": "Ask before you file.",
    "command.title": "Command center",
    "command.intro": "Department desks and the administrator sign in here. Citizens use the public site.",
    "command.email": "Email",
    "command.password": "Password",
    "command.enter": "Enter",
    "command.checking": "Checking…",
    "assistant.ask": "Ask",
    "sev.low": "low",
    "sev.medium": "medium",
    "sev.high": "high",
    "sev.critical": "critical",
    "status.open": "Open",
    "status.in_progress": "In progress",
    "status.resolved": "Resolved",
  },
  hi: {
    "viewLanguage": "भाषा देखें",
    "nav.report": "शिकायत",
    "nav.map": "नक्शा",
    "nav.archive": "अभिलेख",
    "nav.notices": "सूचनाएँ",
    "nav.assistant": "सहायक",
    "nav.account": "खाता",
    "nav.command": "कमांड",
    "nav.overview": "सारांश",
    "nav.incidents": "घटनाएँ",
    "nav.analytics": "विश्लेषण",
    "nav.hotspots": "हॉटस्पॉट",
    "nav.copilot": "कोपायलट",
    "nav.evaluation": "मूल्यांकन",
    "nav.audit": "ऑडिट",
    "nav.reports": "रिपोर्ट",
    "nav.accounts": "खाते",
    "hero.eyebrow": "मुंबई नागरिक बुद्धिमत्ता",
    "hero.title": "सड़क, समझ में आती हुई।",
    "hero.body": "समस्या अंग्रेज़ी, हिन्दी या मराठी में लिखें, हो तो फ़ोटो जोड़ें, और जगह पिन करें। CivicMind जाँचता है कि शिकायत असली है, उसे पास की उसी घटना से जोड़ता है, और सही विभाग को भेजता है।",
    "hero.file": "शिकायत दर्ज करें",
    "hero.map": "नक्शा देखें",
    "stat.complaints": "सक्रिय शिकायतें",
    "stat.incidents": "सक्रिय घटनाएँ",
    "stat.resolved": "निवारित",
    "stat.archive": "अभिलेख",
    "form.eyebrow": "नई शिकायत",
    "form.title": "नागरिक शिकायत दर्ज करें",
    "form.what": "क्या हो रहा है?",
    "form.speak": "बोलें",
    "form.stop": "सुनना बंद करें",
    "form.detecting": "भाषा पहचानी जा रही है…",
    "form.voiceHint": "अंग्रेज़ी, हिन्दी या मराठी में बोलें। अगर चुनी हुई भाषा अलग है, तो सुनी हुई भाषा अपने आप चुन ली जाती है।",
    "form.photo": "फ़ोटो, वैकल्पिक",
    "form.take": "फ़ोटो लें",
    "form.upload": "फ़ोटो अपलोड करें",
    "form.photoHint": "फ़ोटो को लिखी बात से मिलाया जाता है। सेल्फ़ी, खाना, या असंबंधित तस्वीर अस्वीकार होती है।",
    "form.location": "स्थान",
    "form.pinHint": "नाम सबसे नज़दीकी सड़क का है। सड़क गलत हो तो नक्शे पर सही जगह टैप करें।",
    "form.myLocation": "मेरा स्थान इस्तेमाल करें",
    "form.finding": "स्थान खोजा जा रहा है…",
    "form.submit": "शिकायत भेजें",
    "form.checking": "शिकायत जाँची जा रही है…",
    "form.remove": "हटाएँ",
    "form.heard": "{language} सुनी गई, इसलिए वही भाषा चुनी गई।",
    "lang.en": "अंग्रेज़ी",
    "lang.hi": "हिन्दी",
    "lang.mr": "मराठी",
    "records.eyebrow": "पहले से दर्ज",
    "records.title": "हाल की शिकायतें और घटनाएँ",
    "records.complaints": "शिकायतें",
    "records.incidents": "घटनाएँ",
    "records.search": "खोज",
    "records.apply": "फ़िल्टर लगाएँ",
    "records.searching": "खोज जारी है…",
    "records.words": "नागरिक के शब्द",
    "records.emptyComplaints": "इन फ़िल्टर पर कोई शिकायत नहीं है।",
    "records.emptyIncidents": "इन फ़िल्टर पर कोई घटना नहीं है।",
    "records.note": "विभाग की टिप्पणी",
    "records.status": "स्थिति",
    "records.area": "क्षेत्र",
    "records.anyArea": "कोई भी क्षेत्र",
    "records.category": "श्रेणी",
    "records.any": "कोई भी",
    "records.severity": "गंभीरता",
    "records.issueType": "समस्या का प्रकार",
    "records.from": "से",
    "records.to": "तक",
    "records.near": "मेरे स्थान के पास",
    "records.locateHint": "पास में खोजने से पहले मेरा स्थान इस्तेमाल करें।",
    "map.label": "मुंबई की शिकायतें",
    "map.hint": "मुंबई पर पैन और ज़ूम करें। बिंदु पर जाकर समस्या पढ़ें।",
    "records.radius": "दायरा",
    "report.english": "संग्रहीत रिपोर्ट, अंग्रेज़ी में",
    "notices.eyebrow": "आधिकारिक सूचनाएँ",
    "notices.title": "सूचना पट्ट",
    "notices.body": "विभागों द्वारा जारी चेतावनी, बंदिश, सलाह और परिपत्र। वापस ली गई सूचना इस पट्ट से हट जाती है।",
    "notices.all": "सभी",
    "notices.warnings": "चेतावनियाँ",
    "notices.closures": "बंदिशें",
    "notices.advisories": "सलाह",
    "notices.circulars": "परिपत्र",
    "notices.loading": "सूचना पट्ट लोड हो रहा है…",
    "notices.empty": "कोई सक्रिय सूचना नहीं है।",
    "notices.stripEyebrow": "सूचना पट्ट",
    "notices.stripTitle": "लागू चेतावनियाँ और बंदिशें",
    "notices.open": "सूचना पट्ट खोलें",
    "notices.pdf": "पीडीएफ़ खोलें",
    "notices.doc": "दस्तावेज़ खोलें",
    "desk.eyebrow": "दस विभाग",
    "desk.title": "उसी विभाग को भेजा जाता है जिसके पास समस्या है",
    "features.eyebrow": "यह मंच",
    "features.title": "CivicMind क्या करता है",
    "track.title": "शिकायत ट्रैक करें",
    "track.body": "अपनी रिपोर्ट का CM- कोड या घटना का INC- कोड डालें। नीचे की रिपोर्ट दाखिल बात का अंग्रेज़ी रूप है।",
    "track.code": "ट्रैकिंग कोड",
    "track.lookup": "देखें",
    "track.looking": "खोजा जा रहा है…",
    "track.timeline": "समयरेखा",
    "track.reports": "रिपोर्ट",
    "account.guest": "आपका नागरिक रिकॉर्ड",
    "account.in": "साइन इन",
    "account.up": "खाता बनाएँ",
    "assistant.title": "दर्ज करने से पहले पूछें।",
    "command.title": "कमांड केंद्र",
    "command.intro": "विभाग और प्रशासक यहाँ साइन इन करते हैं। नागरिक सार्वजनिक साइट का उपयोग करते हैं।",
    "command.email": "ईमेल",
    "command.password": "पासवर्ड",
    "command.enter": "प्रवेश",
    "command.checking": "जाँचा जा रहा है…",
    "assistant.ask": "पूछें",
    "sev.low": "कम",
    "sev.medium": "मध्यम",
    "sev.high": "अधिक",
    "sev.critical": "गंभीर",
    "status.open": "खुली",
    "status.in_progress": "प्रगति पर",
    "status.resolved": "निवारित",
  },
  mr: {
    "viewLanguage": "भाषा पहा",
    "nav.report": "तक्रार",
    "nav.map": "नकाशा",
    "nav.archive": "संग्रह",
    "nav.notices": "सूचना",
    "nav.assistant": "सहाय्यक",
    "nav.account": "खाते",
    "nav.command": "कमांड",
    "nav.overview": "सारांश",
    "nav.incidents": "घटना",
    "nav.analytics": "विश्लेषण",
    "nav.hotspots": "हॉटस्पॉट",
    "nav.copilot": "कोपायलट",
    "nav.evaluation": "मूल्यांकन",
    "nav.audit": "ऑडिट",
    "nav.reports": "अहवाल",
    "nav.accounts": "खाती",
    "hero.eyebrow": "मुंबई नागरी बुद्धिमत्ता",
    "hero.title": "रस्ता, समजून घेतलेला.",
    "hero.body": "समस्या इंग्रजी, हिंदी किंवा मराठीत लिहा, असेल तर फोटो जोडा, आणि जागा पिन करा. CivicMind तक्रार खरी आहे का ते तपासते, जवळच्या त्याच घटनेशी जोडते, आणि योग्य विभागाकडे पाठवते.",
    "hero.file": "तक्रार नोंदवा",
    "hero.map": "नकाशा पाहा",
    "stat.complaints": "सक्रिय तक्रारी",
    "stat.incidents": "सक्रिय घटना",
    "stat.resolved": "निकाली",
    "stat.archive": "संग्रह",
    "form.eyebrow": "नवी तक्रार",
    "form.title": "नागरी तक्रार नोंदवा",
    "form.what": "काय चालले आहे?",
    "form.speak": "बोला",
    "form.stop": "ऐकणे थांबवा",
    "form.detecting": "भाषा ओळखली जात आहे…",
    "form.voiceHint": "इंग्रजी, हिंदी किंवा मराठीत बोला. निवडलेली भाषा वेगळी असेल तर ऐकलेली भाषा आपोआप निवडली जाते.",
    "form.photo": "फोटो, ऐच्छिक",
    "form.take": "फोटो काढा",
    "form.upload": "फोटो अपलोड करा",
    "form.photoHint": "फोटो लिहिलेल्या मजकुराशी तपासला जातो. सेल्फी, जेवण किंवा असंबद्ध चित्र नाकारले जाते.",
    "form.location": "स्थान",
    "form.pinHint": "नाव जवळच्या रस्त्याचे आहे. रस्ता चुकीचा असेल तर नकाशावर योग्य जागा टॅप करा.",
    "form.myLocation": "माझे स्थान वापरा",
    "form.finding": "स्थान शोधले जात आहे…",
    "form.submit": "तक्रार पाठवा",
    "form.checking": "तक्रार तपासली जात आहे…",
    "form.remove": "काढा",
    "form.heard": "{language} ऐकली, म्हणून ती भाषा निवडली.",
    "lang.en": "इंग्रजी",
    "lang.hi": "हिंदी",
    "lang.mr": "मराठी",
    "records.eyebrow": "आधी नोंदलेले",
    "records.title": "अलीकडील तक्रारी आणि घटना",
    "records.complaints": "तक्रारी",
    "records.incidents": "घटना",
    "records.search": "शोध",
    "records.apply": "गाळणी लावा",
    "records.searching": "शोध सुरू आहे…",
    "records.words": "नागरिकाचे शब्द",
    "records.emptyComplaints": "या गाळणींवर तक्रार नाही.",
    "records.emptyIncidents": "या गाळणींवर घटना नाही.",
    "records.note": "विभागाची नोंद",
    "records.status": "स्थिती",
    "records.area": "भाग",
    "records.anyArea": "कोणताही भाग",
    "records.category": "वर्ग",
    "records.any": "कोणतेही",
    "records.severity": "तीव्रता",
    "records.issueType": "समस्येचा प्रकार",
    "records.from": "पासून",
    "records.to": "पर्यंत",
    "records.near": "माझ्या स्थानाजवळ",
    "records.locateHint": "जवळ शोधण्यापूर्वी माझे स्थान वापरा.",
    "map.label": "मुंबईतील तक्रारी",
    "map.hint": "मुंबईवर पॅन आणि झूम करा. मुद्दा वाचण्यासाठी बिंदूवर टॅप करा.",
    "records.radius": "परिसर",
    "report.english": "साठवलेला अहवाल, इंग्रजीत",
    "notices.eyebrow": "अधिकृत सूचना",
    "notices.title": "सूचना फलक",
    "notices.body": "विभागांनी काढलेल्या इशारे, बंदिस्तता, सल्ला आणि परिपत्रके. मागे घेतलेली सूचना या फलकावरून जाते.",
    "notices.all": "सर्व",
    "notices.warnings": "इशारे",
    "notices.closures": "बंदिस्तता",
    "notices.advisories": "सल्ला",
    "notices.circulars": "परिपत्रके",
    "notices.loading": "सूचना फलक लोड होत आहे…",
    "notices.empty": "सक्रिय सूचना नाही.",
    "notices.stripEyebrow": "सूचना फलक",
    "notices.stripTitle": "लागू इशारे आणि बंदिस्तता",
    "notices.open": "सूचना फलक उघडा",
    "notices.pdf": "पीडीएफ उघडा",
    "notices.doc": "दस्तऐवज उघडा",
    "desk.eyebrow": "दहा विभाग",
    "desk.title": "ज्या विभागाकडे समस्या आहे त्याकडे पाठवले जाते",
    "features.eyebrow": "हे व्यासपीठ",
    "features.title": "CivicMind काय करते",
    "track.title": "तक्रार शोधा",
    "track.body": "तुमच्या अहवालाचा CM- कोड किंवा घटनेचा INC- कोड टाका. खालील अहवाल दाखल केलेल्या मजकुराचे इंग्रजी रूप आहे.",
    "track.code": "ट्रॅकिंग कोड",
    "track.lookup": "शोधा",
    "track.looking": "शोधले जात आहे…",
    "track.timeline": "कालरेषा",
    "track.reports": "अहवाल",
    "account.guest": "तुमची नागरी नोंद",
    "account.in": "साइन इन",
    "account.up": "खाते तयार करा",
    "assistant.title": "नोंदवण्यापूर्वी विचारा.",
    "command.title": "कमांड सेंटर",
    "command.intro": "विभाग आणि प्रशासक येथे साइन इन करतात. नागरिक सार्वजनिक साइट वापरतात.",
    "command.email": "ईमेल",
    "command.password": "पासवर्ड",
    "command.enter": "प्रवेश",
    "command.checking": "तपासले जात आहे…",
    "assistant.ask": "विचारा",
    "sev.low": "कमी",
    "sev.medium": "मध्यम",
    "sev.high": "जास्त",
    "sev.critical": "गंभीर",
    "status.open": "खुली",
    "status.in_progress": "प्रगतीपथावर",
    "status.resolved": "निकाली",
  },
};

type LocaleValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "hi" || stored === "mr" || stored === "en") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "hi" ? "hi" : locale === "mr" ? "mr" : "en";
  }, [locale]);

  const value = useMemo<LocaleValue>(() => {
    const t = (key: string, vars?: Record<string, string>) => {
      const template = MESSAGES[locale][key] || MESSAGES.en[key] || key;
      if (!vars) return template;
      return Object.entries(vars).reduce((text, [name, replacement]) => text.replaceAll(`{${name}}`, replacement), template);
    };
    return {
      locale,
      setLocale: (next) => {
        setLocaleState(next);
        window.localStorage.setItem(STORAGE_KEY, next);
      },
      t,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}

export function ViewLanguageSelect() {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="view-lang">
      <span className="sr-only">{t("viewLanguage")}</span>
      <select aria-label={t("viewLanguage")} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
        <option value="mr">मराठी</option>
      </select>
    </label>
  );
}

const memory = new Map<string, string>();

function needsTranslation(text: string, locale: Locale) {
  const cleaned = text.trim();
  if (!cleaned) return false;
  if (locale !== "en") return true;
  return (cleaned.match(/[\u0900-\u097F]/g) || []).length >= 4;
}

export async function translateMany(texts: string[], locale: Locale): Promise<string[]> {
  const missing: string[] = [];
  for (const text of texts) {
    if (!needsTranslation(text, locale) || memory.has(`${locale}:${text}`) || missing.includes(text)) continue;
    missing.push(text);
  }
  if (missing.length > 0) {
    try {
      for (let start = 0; start < missing.length; start += 40) {
        const slice = missing.slice(start, start + 40);
        const translated = await translateTexts(slice, locale);
        slice.forEach((text, index) => memory.set(`${locale}:${text}`, translated[index] || text));
      }
    } catch {
      missing.forEach((text) => memory.set(`${locale}:${text}`, text));
    }
  }
  return texts.map((text) => memory.get(`${locale}:${text}`) || text);
}

export function useTranslations(texts: string[]): string[] {
  const { locale } = useLocale();
  const [shown, setShown] = useState(texts);
  const signature = `${locale}\u0000${texts.join("\u0000")}`;
  const latest = useRef(texts);
  latest.current = texts;
  const pending = texts.some((text) => needsTranslation(text, locale));

  useEffect(() => {
    const current = latest.current;
    if (!current.some((text) => needsTranslation(text, locale))) {
      setShown(current);
      return;
    }
    let cancel = false;
    setShown(current);
    void translateMany(current, locale).then((next) => {
      if (!cancel) setShown(next);
    });
    return () => {
      cancel = true;
    };
  }, [locale, signature]);

  const safe = shown.length === texts.length ? shown : texts;
  return pending ? safe : texts;
}

export function ViewText({ text }: { text: string | null | undefined }) {
  const value = text || "";
  const [shown] = useTranslations([value]);
  return <>{shown}</>;
}

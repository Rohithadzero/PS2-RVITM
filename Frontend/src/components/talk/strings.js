// What Talk says on its own, as opposed to what the interview asks (that comes from the server, in the interview's language).
// English, Hindi and Kannada are written out. Every other language gets the English lines, spoken with an English voice, so a
// Tamil speaker hears clear English instead of English words in a Tamil accent. Hindi and Kannada are drafts for a native speaker.

const en = {
  greet: (name) => `Hi${name ? ` ${name}` : ''}. I can start a new campaign, change something in your current campaign, or take you to any screen. What would you like?`,
  help: 'You can say: new campaign. Or: change the price to fifty. Or: open customers, open insights, open settings. While I ask questions, say repeat, skip, or build the plan.',
  unknown: "I did not catch what you want to do. Try: new campaign, change the price, or open customers.",
  noCampaign: 'You do not have a campaign yet. Say new campaign to start one.',
  opening: (page) => `Opening ${page}.`,
  newStart: 'Okay, a new campaign. I will ask a few short questions. Answer in your own words.',
  optionsRead: (list) => `You can say ${list}.`,
  allAnswered: 'That is everything I need. Say build the plan, or tap the button.',
  building: 'Building your plan from your own words.',
  skipped: 'Skipped.',
  skipNotAllowed: 'This one is needed, so I cannot skip it.',
  changeIntro: 'Say the change, for example: make the price fifty rupees, or change the offer day to Saturday.',
  proposal: (summary, n, names) => `${summary} This touches ${n} ${n === 1 ? 'asset' : 'assets'}${names ? `: ${names}` : ''}. Say apply to go ahead, or cancel.`,
  notGrounded: 'I could not find that number, date or day in what you said, so I will not apply it. Please say it again.',
  confirmHint: 'Say apply, or cancel.',
  applied: (n) => `Done. ${n} ${n === 1 ? 'asset is' : 'assets are'} being rewritten and checked again.`,
  discarded: 'Okay, nothing was changed.',
  notUnderstood: 'I did not understand that change. Please say it another way.',
  error: (msg) => `Something went wrong. ${msg}`,
  noSpeech: 'I am still here. Tap the mic when you are ready.',
  resumed: 'Welcome back. Let us continue.',
};

const hi = {
  ...en,
  greet: (name) => `नमस्ते${name ? ` ${name}` : ''}। मैं नया कैंपेन शुरू कर सकता हूँ, आपके मौजूदा कैंपेन में कुछ बदल सकता हूँ, या किसी भी स्क्रीन पर ले जा सकता हूँ। आप क्या करना चाहेंगे?`,
  help: 'आप कह सकते हैं: नया कैंपेन। या: कीमत पचास कर दो। या: ग्राहक खोलो, सेटिंग खोलो। सवालों के दौरान दोबारा, छोड़ दो, या प्लान बनाओ कह सकते हैं।',
  unknown: 'मैं समझ नहीं पाया। कहिए: नया कैंपेन, कीमत बदलो, या ग्राहक खोलो।',
  noCampaign: 'अभी कोई कैंपेन नहीं है। शुरू करने के लिए नया कैंपेन कहिए।',
  opening: (page) => `${page} खोल रहा हूँ।`,
  newStart: 'ठीक है, नया कैंपेन। मैं कुछ छोटे सवाल पूछूँगा। अपने शब्दों में जवाब दीजिए।',
  optionsRead: (list) => `आप कह सकते हैं ${list}।`,
  allAnswered: 'मुझे सब कुछ मिल गया। प्लान बनाओ कहिए, या बटन दबाइए।',
  building: 'आपके अपने शब्दों से प्लान बना रहा हूँ।',
  skipped: 'छोड़ दिया।',
  skipNotAllowed: 'यह ज़रूरी है, इसलिए छोड़ नहीं सकता।',
  changeIntro: 'बदलाव बोलिए, जैसे: कीमत पचास रुपये कर दो, या ऑफ़र का दिन शनिवार कर दो।',
  proposal: (summary, n, names) => `${summary} इससे ${n} चीज़ें बदलेंगी${names ? `: ${names}` : ''}। आगे बढ़ने के लिए हाँ कहिए, या रद्द कहिए।`,
  notGrounded: 'आपकी बात में वह संख्या, तारीख या दिन नहीं मिला, इसलिए मैं इसे लागू नहीं करूँगा। कृपया दोबारा बोलिए।',
  confirmHint: 'हाँ कहिए, या रद्द।',
  applied: (n) => `हो गया। ${n} चीज़ें दोबारा लिखी और जाँची जा रही हैं।`,
  discarded: 'ठीक है, कुछ नहीं बदला।',
  notUnderstood: 'मैं वह बदलाव समझ नहीं पाया। कृपया दूसरे तरीके से बोलिए।',
  error: (msg) => `कुछ गड़बड़ हुई। ${msg}`,
  noSpeech: 'मैं यहीं हूँ। तैयार हों तो माइक दबाइए।',
  resumed: 'वापसी पर स्वागत है। चलिए आगे बढ़ते हैं।',
};

const kn = {
  ...en,
  greet: (name) => `ನಮಸ್ಕಾರ${name ? ` ${name}` : ''}. ನಾನು ಹೊಸ ಪ್ರಚಾರ ಪ್ರಾರಂಭಿಸಬಹುದು, ನಿಮ್ಮ ಈಗಿನ ಪ್ರಚಾರದಲ್ಲಿ ಏನಾದರೂ ಬದಲಿಸಬಹುದು, ಅಥವಾ ಯಾವುದೇ ಪರದೆಗೆ ಕರೆದೊಯ್ಯಬಹುದು. ನಿಮಗೆ ಏನು ಬೇಕು?`,
  help: 'ನೀವು ಹೇಳಬಹುದು: ಹೊಸ ಪ್ರಚಾರ. ಅಥವಾ: ಬೆಲೆಯನ್ನು ಐವತ್ತು ಮಾಡಿ. ಅಥವಾ: ಗ್ರಾಹಕರನ್ನು ತೆರೆಯಿರಿ, ಸೆಟ್ಟಿಂಗ್ಸ್ ತೆರೆಯಿರಿ. ಪ್ರಶ್ನೆಗಳ ಸಮಯದಲ್ಲಿ ಮತ್ತೆ ಹೇಳಿ, ಬಿಡಿ, ಅಥವಾ ಯೋಜನೆ ಮಾಡಿ ಎನ್ನಬಹುದು.',
  unknown: 'ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ಹೇಳಿ: ಹೊಸ ಪ್ರಚಾರ, ಬೆಲೆ ಬದಲಿಸಿ, ಅಥವಾ ಗ್ರಾಹಕರನ್ನು ತೆರೆಯಿರಿ.',
  noCampaign: 'ಇನ್ನೂ ಯಾವುದೇ ಪ್ರಚಾರ ಇಲ್ಲ. ಪ್ರಾರಂಭಿಸಲು ಹೊಸ ಪ್ರಚಾರ ಎಂದು ಹೇಳಿ.',
  opening: (page) => `${page} ತೆರೆಯುತ್ತಿದ್ದೇನೆ.`,
  newStart: 'ಸರಿ, ಹೊಸ ಪ್ರಚಾರ. ನಾನು ಕೆಲವು ಸಣ್ಣ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳುತ್ತೇನೆ. ನಿಮ್ಮ ಮಾತುಗಳಲ್ಲೇ ಉತ್ತರಿಸಿ.',
  optionsRead: (list) => `ನೀವು ಹೇಳಬಹುದು ${list}.`,
  allAnswered: 'ನನಗೆ ಬೇಕಾದದ್ದೆಲ್ಲ ಸಿಕ್ಕಿದೆ. ಯೋಜನೆ ಮಾಡಿ ಎಂದು ಹೇಳಿ, ಅಥವಾ ಬಟನ್ ಒತ್ತಿ.',
  building: 'ನಿಮ್ಮ ಮಾತುಗಳಿಂದ ಯೋಜನೆ ಮಾಡುತ್ತಿದ್ದೇನೆ.',
  skipped: 'ಬಿಟ್ಟಿದ್ದೇನೆ.',
  skipNotAllowed: 'ಇದು ಅಗತ್ಯ, ಆದ್ದರಿಂದ ಬಿಡಲಾಗದು.',
  changeIntro: 'ಬದಲಾವಣೆಯನ್ನು ಹೇಳಿ, ಉದಾಹರಣೆಗೆ: ಬೆಲೆಯನ್ನು ಐವತ್ತು ರೂಪಾಯಿ ಮಾಡಿ.',
  proposal: (summary, n, names) => `${summary} ಇದು ${n} ವಸ್ತುಗಳನ್ನು ಬದಲಿಸುತ್ತದೆ${names ? `: ${names}` : ''}. ಮುಂದುವರಿಯಲು ಹೌದು ಎನ್ನಿ, ಅಥವಾ ರದ್ದು ಮಾಡಿ ಎನ್ನಿ.`,
  notGrounded: 'ನೀವು ಹೇಳಿದ್ದರಲ್ಲಿ ಆ ಸಂಖ್ಯೆ, ದಿನಾಂಕ ಅಥವಾ ದಿನ ಸಿಗಲಿಲ್ಲ, ಆದ್ದರಿಂದ ಅನ್ವಯಿಸುವುದಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಿ.',
  confirmHint: 'ಹೌದು ಅಥವಾ ರದ್ದು ಎನ್ನಿ.',
  applied: (n) => `ಆಯಿತು. ${n} ವಸ್ತುಗಳನ್ನು ಮತ್ತೆ ಬರೆದು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ.`,
  discarded: 'ಸರಿ, ಏನೂ ಬದಲಾಗಲಿಲ್ಲ.',
  notUnderstood: 'ಆ ಬದಲಾವಣೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಬೇರೆ ರೀತಿ ಹೇಳಿ.',
  error: (msg) => `ಏನೋ ತಪ್ಪಾಯಿತು. ${msg}`,
  noSpeech: 'ನಾನು ಇಲ್ಲೇ ಇದ್ದೇನೆ. ಸಿದ್ಧರಾದಾಗ ಮೈಕ್ ಒತ್ತಿ.',
  resumed: 'ಮತ್ತೆ ಸ್ವಾಗತ. ಮುಂದುವರಿಯೋಣ.',
};

const TABLES = { en, hi, kn };

// Returns the lines and the language they are in, for the voice to use.
export const getStrings = (lang) => (TABLES[lang] ? { t: TABLES[lang], lang } : { t: en, lang: 'en' });

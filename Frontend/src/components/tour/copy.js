// Walkthrough steps and their words in each app language. `targets` are data-tour ids, tried in order:
// the first one on screen gets the spotlight (the rail on a laptop, the menu button on a phone).
// Kannada and Hindi copy needs a native-speaker pass before release (docs/native-review.md).
export const STEPS = [
  { id: 'welcome' },
  { id: 'sidebar', targets: ['sidebar', 'menu'] },
  { id: 'start', targets: ['start'] },
  { id: 'talk', targets: ['flow-voice'], radius: 999 },
  { id: 'plan', targets: ['flow-plan'], radius: 999 },
  { id: 'campaign', targets: ['flow-campaign'], radius: 999 },
  { id: 'dashboard', targets: ['flow-dashboard'], radius: 999 },
  { id: 'mic', targets: ['mic'], radius: 999 },
  { id: 'summary', targets: ['summary'] },
  { id: 'new', targets: ['new', 'menu'], radius: 999 },
  { id: 'settings', targets: ['settings', 'menu'] },
  { id: 'done' },
];

export const WELCOME = {
  en: { hello: 'Welcome to GrowIT', ask: 'Which language should we show you around in?' },
  kn: { hello: 'GrowIT ಗೆ ಸ್ವಾಗತ', ask: 'ಯಾವ ಭಾಷೆಯಲ್ಲಿ ನಿಮಗೆ ಆ್ಯಪ್ ಪರಿಚಯಿಸಲಿ?' },
  hi: { hello: 'GrowIT में आपका स्वागत है', ask: 'आपको किस भाषा में ऐप दिखाएँ?' },
};

export const COPY = {
  en: {
    ui: { next: 'Next', back: 'Back', skip: 'Skip tour', skipHint: 'You can replay it from Settings.', start: 'Start my first campaign', later: 'Look around first', step: (n, t) => `${n} of ${t}`, read: 'Read aloud', noVoice: 'No English voice on this device' },
    sidebar: { title: 'Every screen, one rail', body: 'Home, your campaigns and your tools live here. Hover an icon to see its name, or widen the rail from the logo.' },
    start: { title: 'Start with your offer', body: 'Say what you are selling, out loud or by tapping. GrowIT asks a few short questions in your language.' },
    talk: { title: '1. Talk', body: 'Answer the questions by voice. Every answer is kept in your own words.' },
    plan: { title: '2. Plan', body: 'Your answers become a plan. Each line shows where it came from. Lock the facts when they are right.' },
    campaign: { title: '3. Campaign 0', body: 'Posts, posters and messages, each shown as it will appear and checked against your locked facts.' },
    dashboard: { title: '4. Dashboard', body: 'See sends, clicks and checks. Every number comes from the app, not a guess.' },
    mic: { title: 'Change it by voice', body: 'Tap the mic at any time and say a change. You see exactly what it touches before anything runs.' },
    summary: { title: 'Your calendar', body: 'What goes out when, and what needs you next.' },
    new: { title: 'New campaign', body: 'Have a new offer? Start another campaign from here at any time.' },
    settings: { title: 'Settings', body: 'Add your Agnes key, choose voice options and colours. You can replay this tour from here.' },
    done: { title: 'You are ready', body: 'Start your first campaign now. It takes about two minutes.' },
  },
  kn: {
    ui: { next: 'ಮುಂದೆ', back: 'ಹಿಂದೆ', skip: 'ಪರಿಚಯ ಬಿಡಿ', skipHint: 'ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಿಂದ ಮತ್ತೆ ನೋಡಬಹುದು.', start: 'ಮೊದಲ ಪ್ರಚಾರ ಪ್ರಾರಂಭಿಸಿ', later: 'ಮೊದಲು ಸುತ್ತಾಡುತ್ತೇನೆ', step: (n, t) => `${t} ರಲ್ಲಿ ${n}`, read: 'ಓದಿ ಹೇಳು', noVoice: 'ಈ ಸಾಧನದಲ್ಲಿ ಕನ್ನಡ ಧ್ವನಿ ಇಲ್ಲ' },
    sidebar: { title: 'ಎಲ್ಲಾ ಪರದೆಗಳು ಒಂದೇ ಕಡೆ', body: 'ಮುಖಪುಟ, ನಿಮ್ಮ ಪ್ರಚಾರಗಳು ಮತ್ತು ಉಪಕರಣಗಳು ಇಲ್ಲಿವೆ. ಹೆಸರು ನೋಡಲು ಐಕಾನ್ ಮೇಲೆ ಕರ್ಸರ್ ಇಡಿ.' },
    start: { title: 'ನಿಮ್ಮ ಆಫರ್‌ನಿಂದ ಪ್ರಾರಂಭಿಸಿ', body: 'ನೀವು ಏನು ಮಾರುತ್ತೀರಿ ಎಂದು ಹೇಳಿ ಅಥವಾ ಟ್ಯಾಪ್ ಮಾಡಿ. GrowIT ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ ಕೆಲವು ಸಣ್ಣ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳುತ್ತದೆ.' },
    talk: { title: '1. ಮಾತನಾಡಿ', body: 'ಪ್ರಶ್ನೆಗಳಿಗೆ ಧ್ವನಿಯಲ್ಲಿ ಉತ್ತರಿಸಿ. ಪ್ರತಿಯೊಂದು ಉತ್ತರ ನಿಮ್ಮದೇ ಮಾತುಗಳಲ್ಲಿ ಉಳಿಯುತ್ತದೆ.' },
    plan: { title: '2. ಯೋಜನೆ', body: 'ನಿಮ್ಮ ಉತ್ತರಗಳು ಯೋಜನೆಯಾಗುತ್ತವೆ. ಪ್ರತಿ ಸಾಲು ಎಲ್ಲಿಂದ ಬಂತು ಎಂದು ತೋರಿಸುತ್ತದೆ. ಸರಿಯಾಗಿದ್ದರೆ ಮಾಹಿತಿಯನ್ನು ಲಾಕ್ ಮಾಡಿ.' },
    campaign: { title: '3. ಪ್ರಚಾರ 0', body: 'ಪೋಸ್ಟ್‌ಗಳು, ಪೋಸ್ಟರ್‌ಗಳು ಮತ್ತು ಸಂದೇಶಗಳು ಕಾಣಿಸುವಂತೆಯೇ ಇಲ್ಲಿವೆ, ಮತ್ತು ನಿಮ್ಮ ಮಾಹಿತಿಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಲಾಗಿದೆ.' },
    dashboard: { title: '4. ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', body: 'ಕಳುಹಿಸಿದ ಸಂದೇಶಗಳು, ಕ್ಲಿಕ್‌ಗಳು ಮತ್ತು ಪರಿಶೀಲನೆಗಳನ್ನು ನೋಡಿ. ಪ್ರತಿ ಸಂಖ್ಯೆ ಆ್ಯಪ್‌ನಿಂದಲೇ ಬರುತ್ತದೆ.' },
    mic: { title: 'ಧ್ವನಿಯಿಂದ ಬದಲಾಯಿಸಿ', body: 'ಯಾವಾಗ ಬೇಕಾದರೂ ಮೈಕ್ ಒತ್ತಿ ಬದಲಾವಣೆ ಹೇಳಿ. ಏನಾದರೂ ನಡೆಯುವ ಮೊದಲು ಅದು ಯಾವುದನ್ನು ಬದಲಿಸುತ್ತದೆ ಎಂದು ನೋಡುತ್ತೀರಿ.' },
    summary: { title: 'ನಿಮ್ಮ ಕ್ಯಾಲೆಂಡರ್', body: 'ಯಾವುದು ಯಾವಾಗ ಹೋಗುತ್ತದೆ, ಮುಂದೆ ನೀವು ಏನು ಮಾಡಬೇಕು ಎಂದು ಇಲ್ಲಿ ನೋಡಿ.' },
    new: { title: 'ಹೊಸ ಪ್ರಚಾರ', body: 'ಹೊಸ ಆಫರ್ ಇದೆಯೇ? ಯಾವಾಗ ಬೇಕಾದರೂ ಇಲ್ಲಿಂದ ಇನ್ನೊಂದು ಪ್ರಚಾರ ಪ್ರಾರಂಭಿಸಿ.' },
    settings: { title: 'ಸೆಟ್ಟಿಂಗ್ಸ್', body: 'ನಿಮ್ಮ Agnes ಕೀ, ಧ್ವನಿ ಆಯ್ಕೆಗಳು ಮತ್ತು ಬಣ್ಣಗಳು. ಈ ಪರಿಚಯವನ್ನು ಇಲ್ಲಿಂದ ಮತ್ತೆ ನೋಡಬಹುದು.' },
    done: { title: 'ನೀವು ಸಿದ್ಧರಾಗಿದ್ದೀರಿ', body: 'ನಿಮ್ಮ ಮೊದಲ ಪ್ರಚಾರವನ್ನು ಈಗಲೇ ಪ್ರಾರಂಭಿಸಿ. ಸುಮಾರು ಎರಡು ನಿಮಿಷ ಸಾಕು.' },
  },
  hi: {
    ui: { next: 'आगे', back: 'पीछे', skip: 'टूर छोड़ें', skipHint: 'इसे सेटिंग्स से दोबारा देख सकते हैं।', start: 'पहला कैंपेन शुरू करें', later: 'पहले ऐप देखूँगा', step: (n, t) => `${t} में से ${n}`, read: 'पढ़कर सुनाएँ', noVoice: 'इस डिवाइस पर हिन्दी आवाज़ नहीं है' },
    sidebar: { title: 'हर स्क्रीन, एक जगह', body: 'होम, आपके कैंपेन और टूल यहीं हैं। नाम देखने के लिए आइकन पर कर्सर रखें।' },
    start: { title: 'अपने ऑफ़र से शुरू करें', body: 'बोलकर या टैप करके बताइए कि आप क्या बेच रहे हैं। GrowIT आपकी भाषा में कुछ छोटे सवाल पूछेगा।' },
    talk: { title: '1. बात करें', body: 'सवालों के जवाब बोलकर दें। हर जवाब आपके अपने शब्दों में रखा जाता है।' },
    plan: { title: '2. प्लान', body: 'आपके जवाब एक प्लान बनते हैं। हर लाइन बताती है कि वह कहाँ से आई। सही हों तो तथ्य लॉक करें।' },
    campaign: { title: '3. कैंपेन 0', body: 'पोस्ट, पोस्टर और मैसेज, जैसे दिखेंगे वैसे ही, और आपके लॉक किए तथ्यों से जाँचे हुए।' },
    dashboard: { title: '4. डैशबोर्ड', body: 'भेजे गए मैसेज, क्लिक और जाँच देखें। हर संख्या ऐप से आती है, अंदाज़े से नहीं।' },
    mic: { title: 'बोलकर बदलें', body: 'कभी भी माइक दबाकर बदलाव बोलें। कुछ भी चलने से पहले आप देखेंगे कि क्या-क्या बदलेगा।' },
    summary: { title: 'आपका कैलेंडर', body: 'क्या कब जाएगा, और आगे आपको क्या करना है।' },
    new: { title: 'नया कैंपेन', body: 'नया ऑफ़र है? कभी भी यहाँ से दूसरा कैंपेन शुरू करें।' },
    settings: { title: 'सेटिंग्स', body: 'अपनी Agnes की, आवाज़ और रंग चुनें। यह टूर यहीं से दोबारा देख सकते हैं।' },
    done: { title: 'आप तैयार हैं', body: 'अपना पहला कैंपेन अभी शुरू करें। लगभग दो मिनट लगते हैं।' },
  },
};

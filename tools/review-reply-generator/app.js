/* Review Reply Generator. Pure template engine, runs in the browser; nothing is sent anywhere and nothing is posted. */
(function () {
  var $ = LB.$;
  /* ---------- categories ---------- */
  var CATS = [
    { id: 'restaurant', l: ['Restaurant / Cafe', 'रेस्टोरेंट / कैफ़े'], x: {
      en: ['meal', 'We hope to welcome you at our table again.'],
      hi: ['खाने का अनुभव', 'आपका फिर से हमारे यहाँ स्वागत है।'],
      hn: ['khaane ka anubhav', 'Aapka phir se hamare yahan swagat hai.'] } },
    { id: 'salon', l: ['Salon / Beauty parlour', 'सैलून / ब्यूटी पार्लर'], x: {
      en: ['salon visit', 'We would be happy to see you in the chair again.'],
      hi: ['सैलून का अनुभव', 'आपको फिर से सैलून में देखकर हमें खुशी होगी।'],
      hn: ['salon ka anubhav', 'Aapko phir se salon mein dekhkar khushi hogi.'] } },
    { id: 'clinic', health: 1, l: ['Doctor / Clinic', 'डॉक्टर / क्लिनिक'], x: {
      en: ['experience', 'Wishing you good health.'],
      hi: ['अनुभव', 'आपके अच्छे स्वास्थ्य की कामना है।'],
      hn: ['anubhav', 'Aapke achhe swasthya ki kamna hai.'] } },
    { id: 'dental', health: 1, l: ['Dental clinic', 'डेंटल क्लिनिक'], x: {
      en: ['experience', 'Wishing you good oral health.'],
      hi: ['अनुभव', 'आपके दाँतों की सेहत के लिए शुभकामनाएँ।'],
      hn: ['anubhav', 'Aapke daanton ki sehat ke liye shubhkamnayein.'] } },
    { id: 'pharmacy', health: 1, l: ['Pharmacy / Medical store', 'फ़ार्मेसी / मेडिकल स्टोर'], x: {
      en: ['experience', 'Wishing you good health.'],
      hi: ['अनुभव', 'आपके अच्छे स्वास्थ्य की कामना है।'],
      hn: ['anubhav', 'Aapke achhe swasthya ki kamna hai.'] } },
    { id: 'gym', l: ['Gym / Fitness studio', 'जिम / फ़िटनेस स्टूडियो'], x: {
      en: ['workout experience', 'Keep up the effort, we are cheering you on.'],
      hi: ['वर्कआउट का अनुभव', 'आपकी मेहनत जारी रहे, हम आपके साथ हैं।'],
      hn: ['workout ka anubhav', 'Aapki mehnat jaari rahe, hum aapke saath hain.'] } },
    { id: 'kirana', l: ['Kirana / Grocery store', 'किराना / ग्रॉसरी स्टोर'], x: {
      en: ['shopping experience', 'Thank you for supporting your local store.'],
      hi: ['खरीदारी का अनुभव', 'अपनी स्थानीय दुकान को चुनने के लिए धन्यवाद।'],
      hn: ['kharidari ka anubhav', 'Apni local dukaan ko chunne ke liye dhanyavaad.'] } },
    { id: 'retail', l: ['Clothing / Retail shop', 'कपड़े / रिटेल दुकान'], x: {
      en: ['shopping experience', 'We hope you find something you love next time too.'],
      hi: ['खरीदारी का अनुभव', 'उम्मीद है अगली बार भी आपको कुछ पसंद का मिलेगा।'],
      hn: ['kharidari ka anubhav', 'Umeed hai agli baar bhi aapko kuch pasand ka mile.'] } },
    { id: 'repair', l: ['Mobile / Electronics repair', 'मोबाइल / इलेक्ट्रॉनिक्स रिपेयर'], x: {
      en: ['repair experience', 'If the device needs anything else, we are here to help.'],
      hi: ['रिपेयर का अनुभव', 'डिवाइस में कुछ और हो तो हम मदद के लिए यहाँ हैं।'],
      hn: ['repair ka anubhav', 'Device mein kuch aur ho to hum madad ke liye yahan hain.'] } },
    { id: 'auto', l: ['Car / Bike service centre', 'कार / बाइक सर्विस सेंटर'], x: {
      en: ['service experience', 'Drive safe, and see you at your next service.'],
      hi: ['सर्विस का अनुभव', 'सुरक्षित चलाएँ, अगली सर्विस पर मिलते हैं।'],
      hn: ['service ka anubhav', 'Surakshit chalaayein, agli service par milte hain.'] } },
    { id: 'coaching', l: ['Coaching / Tuition class', 'कोचिंग / ट्यूशन क्लास'], x: {
      en: ['learning experience', 'Wishing you the very best in your studies.'],
      hi: ['पढ़ाई का अनुभव', 'आपकी पढ़ाई के लिए शुभकामनाएँ।'],
      hn: ['padhai ka anubhav', 'Aapki padhai ke liye shubhkamnayein.'] } },
    { id: 'realestate', l: ['Real estate / Property dealer', 'रियल एस्टेट / प्रॉपर्टी डीलर'], x: {
      en: ['property search experience', 'Wishing you all the best with your property plans.'],
      hi: ['प्रॉपर्टी खोज का अनुभव', 'आपकी प्रॉपर्टी योजनाओं के लिए शुभकामनाएँ।'],
      hn: ['property search ka anubhav', 'Aapki property yojnaon ke liye shubhkamnayein.'] } },
    { id: 'hotel', l: ['Hotel / Homestay', 'होटल / होमस्टे'], x: {
      en: ['stay', 'We would be happy to host you again.'],
      hi: ['ठहरने का अनुभव', 'आपकी मेज़बानी फिर करके हमें खुशी होगी।'],
      hn: ['thehrne ka anubhav', 'Aapki mezbaani phir karke humein khushi hogi.'] } },
    { id: 'homeservice', l: ['Home services (plumber, electrician, cleaning)', 'होम सर्विस (प्लंबर, इलेक्ट्रीशियन, सफ़ाई)'], x: {
      en: ['service experience', 'Get in touch whenever you need help at home.'],
      hi: ['सर्विस का अनुभव', 'घर पर मदद चाहिए हो तो संपर्क कीजिए।'],
      hn: ['service ka anubhav', 'Ghar par madad chahiye ho to sampark kijiye.'] } },
    { id: 'photo', l: ['Photography / Event services', 'फ़ोटोग्राफ़ी / इवेंट सर्विस'], x: {
      en: ['photography experience', 'Thank you for letting us be part of your moments.'],
      hi: ['फ़ोटोग्राफ़ी का अनुभव', 'अपने खास पलों में हमें शामिल करने के लिए धन्यवाद।'],
      hn: ['photography ka anubhav', 'Apne khaas palon mein hume shaamil karne ke liye dhanyavaad.'] } },
    { id: 'other', l: ['Other local business', 'अन्य लोकल बिज़नेस'], x: {
      en: ['experience', 'Thank you for supporting a local business.'],
      hi: ['अनुभव', 'स्थानीय बिज़नेस का साथ देने के लिए धन्यवाद।'],
      hn: ['anubhav', 'Local business ka saath dene ke liye dhanyavaad.'] } }
  ];

  /* ---------- templates: CORE[lang][sentiment][tone] = 3 variants ---------- */
  var CORE = {
    en: {
      pos: {
        warm: ['Thank you so much for the {rv}! It means a lot to everyone at {biz} that you shared your {exp}.',
               'What a lovely note to receive, thank you! We are really glad your {exp} at {biz} went well.',
               'Thanks for taking the time to write this. Hearing that your {exp} was a good one makes our day at {biz}.'],
        professional: ['Thank you for your {rv} and for sharing your {exp} with {biz}. We appreciate your feedback.',
               'We appreciate you taking the time to review {biz}. We are pleased that your {exp} met your expectations.',
               'Thank you for choosing {biz} and for your kind words about your {exp}.'],
        brief: ['Thank you for the {rv}!', 'Thanks for your kind words about {biz}!', 'Much appreciated, thank you for the {rv}.']
      },
      neu: {
        warm: ['Thanks for being honest about your {exp} at {biz}. We are glad parts of it worked for you, and we would like to do better on the rest.',
               'Thank you for the balanced feedback. It helps us see things the way you did.',
               'We appreciate you sharing your thoughts. A mixed experience tells us where {biz} can improve.'],
        professional: ['Thank you for your feedback on your {exp} at {biz}. We value the details you shared.',
               'We appreciate your review. Your comments have been noted.',
               'Thank you for taking the time to review {biz}. Feedback like yours helps us improve.'],
        brief: ['Thank you for the feedback, we have noted it.', 'Thanks for your honest review of {biz}.', 'We appreciate your feedback.']
      },
      neg: {
        warm: ['We are sorry your {exp} at {biz} was not what you hoped for. Thank you for telling us.',
               'Thank you for letting us know. We are sorry to hear this and we would like to understand what happened.',
               'We are sorry that your {exp} left you disappointed. That is not the experience we want anyone to have at {biz}.'],
        professional: ['Thank you for your feedback. We are sorry that your {exp} with {biz} did not meet your expectations.',
               'We regret that your experience was not satisfactory, and we appreciate you raising it.',
               'We take feedback seriously and are sorry to learn of your concerns about your {exp}.'],
        brief: ['We are sorry to hear this and would like to understand what happened.', 'Sorry your experience did not meet expectations. Thank you for the feedback.', 'Thank you for telling us. We are sorry this was disappointing.']
      }
    },
    hi: {
      pos: {
        warm: ['आपके {rv} के लिए बहुत-बहुत धन्यवाद! {biz} में सभी को खुशी हुई कि आपने अपना {exp} हमारे साथ साझा किया।',
               'इतना प्यारा संदेश भेजने के लिए शुक्रिया! हमें खुशी है कि {biz} में आपका {exp} अच्छा रहा।',
               'समय निकालकर लिखने के लिए धन्यवाद। जानकर अच्छा लगा कि आपका {exp} बढ़िया रहा।'],
        professional: ['आपके {rv} के लिए धन्यवाद। {biz} में आपका {exp} अच्छा रहा, यह जानकर हमें प्रसन्नता हुई।',
               '{biz} का रिव्यू लिखने के लिए समय देने हेतु धन्यवाद। हमें प्रसन्नता है कि आपका {exp} आपकी अपेक्षाओं के अनुरूप रहा।',
               '{biz} को चुनने और अपनी सकारात्मक प्रतिक्रिया देने के लिए आपका आभार।'],
        brief: ['आपके {rv} के लिए धन्यवाद!', '{biz} के बारे में अच्छे शब्दों के लिए शुक्रिया!', 'आपका बहुत-बहुत धन्यवाद, यह हमारे लिए मायने रखता है।']
      },
      neu: {
        warm: ['{biz} में अपने {exp} के बारे में ईमानदारी से बताने के लिए शुक्रिया। जो बातें अच्छी लगीं उसकी हमें खुशी है, और बाकी में हम बेहतर करना चाहेंगे।',
               'संतुलित प्रतिक्रिया के लिए धन्यवाद। इससे हमें वही देखने में मदद मिलती है जो आपने देखा।',
               'अपनी बात साझा करने के लिए आभार। मिला-जुला अनुभव हमें बताता है कि {biz} कहाँ सुधार कर सकता है।'],
        professional: ['{biz} में आपके {exp} पर प्रतिक्रिया देने के लिए धन्यवाद। आपने जो बातें बताईं, हम उनकी कद्र करते हैं।',
               'आपके रिव्यू के लिए धन्यवाद। आपकी टिप्पणियाँ हमने नोट कर ली हैं।',
               '{biz} का रिव्यू लिखने के लिए समय निकालने का धन्यवाद। ऐसी प्रतिक्रिया हमें सुधार में मदद करती है।'],
        brief: ['प्रतिक्रिया के लिए धन्यवाद, हमने इसे नोट किया है।', '{biz} के बारे में ईमानदार रिव्यू के लिए शुक्रिया।', 'आपकी राय के लिए आभार।']
      },
      neg: {
        warm: ['{biz} में आपका {exp} आपकी उम्मीद के मुताबिक़ नहीं रहा, इसका हमें खेद है। हमें बताने के लिए धन्यवाद।',
               'बताने के लिए धन्यवाद। यह सुनकर हमें दुख हुआ और हम समझना चाहते हैं कि क्या हुआ।',
               'हमें खेद है कि आपका {exp} निराशाजनक रहा। {biz} में हम किसी का अनुभव ऐसा नहीं चाहते।'],
        professional: ['प्रतिक्रिया के लिए धन्यवाद। {biz} में आपका {exp} आपकी अपेक्षाओं पर खरा नहीं उतरा, इसका हमें खेद है।',
               'हमें खेद है कि आपका अनुभव संतोषजनक नहीं रहा, और हम इसे उठाने के लिए आपके आभारी हैं।',
               'हम प्रतिक्रिया को गंभीरता से लेते हैं और आपकी चिंताओं के बारे में जानकर हमें खेद है।'],
        brief: ['यह सुनकर खेद है, हम समझना चाहते हैं कि क्या हुआ।', 'आपका अनुभव अपेक्षा के अनुरूप नहीं रहा, इसका खेद है। प्रतिक्रिया के लिए धन्यवाद।', 'बताने के लिए धन्यवाद। हमें इस निराशा का खेद है।']
      }
    },
    hn: {
      pos: {
        warm: ['Aapke {rv} ke liye bahut shukriya! {biz} mein sabko khushi hui ki aapne apna {exp} humse share kiya.',
               'Itna pyaara message bhejne ke liye thank you! Hume khushi hai ki {biz} mein aapka {exp} accha raha.',
               'Time nikaal kar likhne ke liye shukriya. Jaan kar accha laga ki aapka {exp} badhiya raha.'],
        professional: ['Aapke {rv} ke liye dhanyavaad. {biz} mein aapka {exp} accha raha, yeh jaan kar humein prasannata hui.',
               '{biz} ka review likhne ke liye samay dene ke liye dhanyavaad. Humein khushi hai ki aapka {exp} aapki apekshaon ke anuroop raha.',
               '{biz} ko chunne aur apni positive feedback dene ke liye aabhaar.'],
        brief: ['Aapke {rv} ke liye thank you!', '{biz} ke baare mein accha likhne ke liye shukriya!', 'Bahut shukriya, yeh hamare liye maayne rakhta hai.']
      },
      neu: {
        warm: ['{biz} mein apne {exp} ke baare mein imaandari se batane ke liye shukriya. Jo cheezein achhi lagi unki khushi hai, aur baaki mein hum behtar karna chahenge.',
               'Balanced feedback ke liye thank you. Isse hume wahi dekhne mein madad milti hai jo aapne dekha.',
               'Apni baat share karne ke liye shukriya. Mila-jula anubhav batata hai ki {biz} kahan sudhaar kar sakta hai.'],
        professional: ['{biz} mein aapke {exp} par feedback dene ke liye dhanyavaad. Aapne jo baatein bataayi, hum unki kadar karte hain.',
               'Aapke review ke liye dhanyavaad. Aapki tippaniyan humne note kar li hain.',
               '{biz} ka review likhne ke liye samay nikaalne ka dhanyavaad. Aisi feedback hume sudhaar mein madad karti hai.'],
        brief: ['Feedback ke liye dhanyavaad, humne ise note kiya hai.', '{biz} ke baare mein honest review ke liye shukriya.', 'Aapki raay ke liye aabhaar.']
      },
      neg: {
        warm: ['{biz} mein aapka {exp} aapki ummeed ke mutabik nahi raha, iska hume khed hai. Batane ke liye shukriya.',
               'Batane ke liye shukriya. Yeh sunkar hume dukh hua aur hum samajhna chahte hain ki kya hua.',
               'Hume khed hai ki aapka {exp} nirashajanak raha. {biz} mein hum kisi ka anubhav aisa nahi chahte.'],
        professional: ['Feedback ke liye dhanyavaad. {biz} mein aapka {exp} aapki apekshaon par khara nahi utra, iska hume khed hai.',
               'Hume khed hai ki aapka anubhav santoshjanak nahi raha, aur ise uthane ke liye hum aapke aabhaari hain.',
               'Hum feedback ko gambhirta se lete hain aur aapki chintaon ke baare mein jaankar hume khed hai.'],
        brief: ['Yeh sunkar khed hua, hum samajhna chahte hain ki kya hua.', 'Aapka anubhav apeksha ke anuroop nahi raha, iska khed hai. Feedback ke liye dhanyavaad.', 'Batane ke liye dhanyavaad. Is nirasha ka hume khed hai.']
      }
    }
  };
  var KW = {
    en: { pos: ['Glad that the {kw} stood out for you.', 'It is good to hear the {kw} worked well.'],
          neu: ['We have noted your comments about {kw}.', 'Your points on {kw} are useful to us.'],
          neg: ['Regarding the {kw} you mentioned, we would like to look into it properly.', 'We would like to understand more about the {kw} you mentioned.'] },
    hi: { pos: ['आपने {kw} का ज़िक्र किया, यह जानकर अच्छा लगा।', '{kw} के बारे में आपकी बात सुनकर खुशी हुई।'],
          neu: ['{kw} के बारे में आपकी टिप्पणी हमने नोट की है।', '{kw} पर आपकी बातें हमारे लिए उपयोगी हैं।'],
          neg: ['{kw} के बारे में आपने जो बताया, हम उसे ठीक से समझना चाहेंगे।', 'आपने {kw} का जो ज़िक्र किया, उसके बारे में हम और जानना चाहेंगे।'] },
    hn: { pos: ['Aapne {kw} ka zikr kiya, yeh jaan kar accha laga.', '{kw} ke baare mein aapki baat sunkar khushi hui.'],
          neu: ['{kw} ke baare mein aapki tippani humne note ki hai.', '{kw} par aapki baatein hamare liye upyogi hain.'],
          neg: ['{kw} ke baare mein aapne jo bataya, hum use theek se samajhna chahenge.', 'Aapne {kw} ka jo zikr kiya, uske baare mein hum aur jaanna chahenge.'] }
  };
  /* Offline / contact lines. Negative reviews always point to a direct conversation. */
  var OFF = {
    en: { w: ['Please contact us at {c} so we can look into this and understand what happened.', 'You can reach us at {c}. We would like to hear the details and talk it through directly.', 'Please get in touch at {c} so we can discuss this one-to-one.'],
          n: ['Please use the phone number or message option on our Google profile so we can understand what happened and talk it through directly.', 'Please contact us through the details on our Google profile so we can discuss this directly.', 'We would appreciate a chance to speak with you directly. Please reach us via the contact details on our Google profile.'],
          bw: 'Please contact us at {c}.', bn: 'Please call or message us using the contact details on our Google profile.',
          neu: 'If you would like to talk it through, you can reach us at {c}.' },
    hi: { w: ['कृपया {c} पर हमसे संपर्क करें ताकि हम बात को समझ सकें और सीधे चर्चा कर सकें।', 'आप हमें {c} पर बता सकते हैं। हम पूरी बात सुनना और सीधे बात करना चाहेंगे।', 'कृपया {c} पर संपर्क करें, ताकि हम आमने-सामने या फ़ोन पर इस पर चर्चा कर सकें।'],
          n: ['कृपया हमारी Google प्रोफ़ाइल पर दिए फ़ोन नंबर या मैसेज विकल्प से संपर्क करें, ताकि हम सीधे बात करके समझ सकें कि क्या हुआ।', 'कृपया हमारी Google प्रोफ़ाइल में दिए विवरण से हमसे संपर्क करें, ताकि हम सीधे चर्चा कर सकें।', 'हमें आपसे सीधे बात करने का अवसर मिले तो अच्छा होगा। कृपया हमारी Google प्रोफ़ाइल के संपर्क विवरण से हमें बताएँ।'],
          bw: 'कृपया {c} पर संपर्क करें।', bn: 'कृपया हमारी Google प्रोफ़ाइल पर दिए संपर्क विवरण से हमें कॉल या मैसेज करें।',
          neu: 'यदि आप बात करना चाहें तो {c} पर संपर्क कर सकते हैं।' },
    hn: { w: ['Kripya {c} par humse sampark karein taaki hum baat ko samajh sakein aur seedhe charcha kar sakein.', 'Aap humein {c} par bata sakte hain. Hum poori baat sunna aur seedhe baat karna chahenge.', 'Kripya {c} par sampark karein, taaki hum aamne-saamne ya phone par is par charcha kar sakein.'],
          n: ['Kripya hamari Google profile par diye phone number ya message option se sampark karein, taaki hum seedhe baat karke samajh sakein ki kya hua.', 'Kripya hamari Google profile ke details se humse sampark karein, taaki hum seedhe charcha kar sakein.', 'Humein aapse seedhe baat karne ka avsar mile to accha hoga. Kripya hamari Google profile ke contact details se humein batayein.'],
          bw: 'Kripya {c} par sampark karein.', bn: 'Kripya hamari Google profile ke contact details se humein call ya message karein.',
          neu: 'Agar aap baat karna chahein to {c} par sampark kar sakte hain.' }
  };
  /* Closings: index 0 is the category-specific line for positive replies. */
  var CLOSE = {
    en: { pos: [null, 'We look forward to seeing you again.', 'Thank you again for your support.'],
          neu: ['Thank you for helping us improve.', 'Your feedback is welcome.', 'We hope to have the chance to serve you better.'],
          neg: ['Thank you for giving us the chance to look into this.', 'We appreciate your patience and your feedback.', 'We hope to hear from you directly.'] },
    hi: { pos: [null, 'आपसे दोबारा मिलने की प्रतीक्षा रहेगी।', 'आपके सहयोग के लिए एक बार फिर धन्यवाद।'],
          neu: ['सुधार में मदद करने के लिए धन्यवाद।', 'आपकी प्रतिक्रिया का स्वागत है।', 'हमें आपकी बेहतर सेवा का अवसर मिले, यही आशा है।'],
          neg: ['इस मामले को देखने का अवसर देने के लिए धन्यवाद।', 'आपके धैर्य और प्रतिक्रिया के लिए आभार।', 'हमें आपसे सीधे बात होने की उम्मीद है।'] },
    hn: { pos: [null, 'Aapse dobara milne ki pratiksha rahegi.', 'Aapke sahyog ke liye ek baar phir dhanyavaad.'],
          neu: ['Sudhaar mein madad karne ke liye dhanyavaad.', 'Aapki feedback ka swagat hai.', 'Humein aapki behtar seva ka avsar mile, yahi asha hai.'],
          neg: ['Is maamle ko dekhne ka mauka dene ke liye dhanyavaad.', 'Aapke dhairya aur feedback ke liye aabhaar.', 'Humein aapse seedhe baat hone ki ummeed hai.'] }
  };
  var GREET = {
    en: { warm: ['Hi {n},', 'Hello,'], professional: ['Dear {n},', 'Dear customer,'], brief: ['Hi {n},', 'Hello,'] },
    hi: { warm: ['नमस्ते {n} जी,', 'नमस्ते,'], professional: ['आदरणीय {n} जी,', 'प्रिय ग्राहक,'], brief: ['नमस्ते {n} जी,', 'नमस्ते,'] },
    hn: { warm: ['Namaste {n} ji,', 'Namaste,'], professional: ['Dear {n} ji,', 'Dear customer,'], brief: ['Hi {n} ji,', 'Namaste,'] }
  };
  var SIGN = {
    en: { warm: 'Warm regards,\nTeam {biz}', professional: 'Regards,\n{biz}', brief: '- {biz}' },
    hi: { warm: 'सादर धन्यवाद,\nटीम {biz}', professional: 'सादर,\n{biz}', brief: '- {biz}' },
    hn: { warm: 'Dhanyavaad,\nTeam {biz}', professional: 'Regards,\n{biz}', brief: '- {biz}' }
  };
  var RV = { en: ['{n}-star review', 'review'], hi: ['{n}-स्टार रिव्यू', 'रिव्यू'], hn: ['{n}-star review', 'review'] };

  var UI = {
    en: { reply: 'Reply', chars: 'characters', copy: 'Copy reply', regen: 'Regenerate with variation', variation: 'Variation set', needBiz: 'Please enter your business name.',
          mismatch: 'Your star rating and chosen sentiment do not match, so the replies follow the sentiment you picked. Check both before posting.',
          health: 'Privacy: do not confirm that the reviewer is a patient or customer, and do not mention any treatment, test, prescription or personal detail in a public reply. These drafts are worded generally on purpose.',
          lbl: ['Reply 1', 'Reply 2', 'Reply 3'] },
    hi: { reply: 'रिप्लाई', chars: 'अक्षर', copy: 'रिप्लाई कॉपी करें', regen: 'नए बदलाव के साथ दोबारा बनाएँ', variation: 'वेरिएशन सेट', needBiz: 'कृपया अपने बिज़नेस का नाम भरें।',
          mismatch: 'आपकी स्टार रेटिंग और चुनी हुई भावना मेल नहीं खाती, इसलिए रिप्लाई आपकी चुनी हुई भावना के हिसाब से बने हैं। पोस्ट करने से पहले दोनों जाँच लें।',
          health: 'प्राइवेसी: सार्वजनिक रिप्लाई में यह पुष्टि न करें कि रिव्यू लिखने वाला मरीज़ या ग्राहक है, और किसी इलाज, जाँच, दवा या निजी जानकारी का ज़िक्र न करें। ये ड्राफ़्ट जानबूझकर सामान्य शब्दों में लिखे हैं।',
          lbl: ['रिप्लाई 1', 'रिप्लाई 2', 'रिप्लाई 3'] }
  };
  function ui(k) { return LB.t(UI, k); }

  function clean(s, max) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function fmt(s, m) { return s.replace(/\{(\w+)\}/g, function (_, k) { return m[k] != null ? m[k] : ''; }); }
  function kwList(raw) {
    var seen = {}, out = [];
    String(raw || '').split(/[,;\n।]+/).forEach(function (x) {
      x = clean(x, 40); var key = x.toLowerCase();
      if (x && !seen[key]) { seen[key] = 1; out.push(x); }
    });
    return out.slice(0, 3);
  }
  function joinKw(list, lang) {
    if (list.length < 2) return list[0] || '';
    var and = lang === 'en' ? ' and ' : (lang === 'hi' ? ' और ' : ' aur ');
    return list.slice(0, -1).join(', ') + and + list[list.length - 1];
  }

  /* Build one reply. k = 0..2 position in the set; seed = regeneration counter. */
  function build(o, k, seed) {
    var L = o.lang, S = o.sent, T = o.tone, cat = o.cat;
    var c = (seed + k) % 3;
    var d = (c + 1 + Math.floor(seed / 3)) % 3;
    var x = cat.x[L], exp = x[0];
    var rvPair = RV[L];
    var rv = (S === 'pos' && o.stars >= 4) ? fmt(rvPair[0], { n: o.stars }) : rvPair[1];
    var m = { biz: o.biz, rv: rv, exp: exp, kw: joinKw(o.kws, L), c: o.contact };
    var g = GREET[L][T][o.name ? 0 : 1].replace('{n}', o.name);
    var core = fmt(CORE[L][S][T][c], m);
    var parts = [core];
    if (T !== 'brief' && o.kws.length) parts.push(fmt(KW[L][S][(Math.floor(seed / 2) + k) % 2], m));
    var p1 = parts.join(' ');
    var p2 = [];
    if (S === 'neg') {
      if (T === 'brief') p2.push(o.contact ? fmt(OFF[L].bw, m) : OFF[L].bn);
      else p2.push(o.contact ? fmt(OFF[L].w[(c + 1) % 3], m) : OFF[L].n[(c + 1) % 3]);
    } else if (S === 'neu' && o.contact && T !== 'brief') {
      p2.push(fmt(OFF[L].neu, m));
    }
    if (T !== 'brief') {
      var cl = CLOSE[L][S][d];
      if (S === 'pos' && d === 0) cl = x[1];
      p2.push(cl);
    }
    var sign = fmt(SIGN[L][T], m);
    if (T === 'brief') return g + '\n' + p1 + (p2.length ? ' ' + p2.join(' ') : '') + '\n\n' + sign;
    var body = g + '\n\n' + p1;
    if (p2.length) body += '\n\n' + p2.join(' ');
    return body + '\n\n' + sign;
  }

  /* ---------- UI wiring ---------- */
  var seed = 0, last = null;
  function fillCats() {
    var sel = $('rvCat'), idx = LB.lang === 'hi' ? 1 : 0;
    CATS.forEach(function (c) { var o = document.createElement('option'); o.value = c.id; o.textContent = c.l[idx]; sel.appendChild(o); });
  }
  function sentFromStars(n) { return n >= 4 ? 'pos' : (n === 3 ? 'neu' : 'neg'); }
  var sentTouched = false;

  function readForm() {
    var biz = clean($('rvBiz').value, 80);
    var stars = parseInt($('rvStars').value, 10) || 5;
    return {
      cat: CATS.filter(function (c) { return c.id === $('rvCat').value; })[0] || CATS[CATS.length - 1],
      biz: biz, name: clean($('rvName').value, 40), stars: stars, sent: $('rvSent').value,
      kws: kwList($('rvKw').value), lang: $('rvLang').value, tone: $('rvTone').value, contact: clean($('rvContact').value, 80)
    };
  }
  function render() {
    var o = readForm();
    var err = $('rvErr');
    if (!o.biz) { err.textContent = ui('needBiz'); $('rvResult').classList.add('lb-hidden'); return; }
    err.textContent = '';
    last = o;
    var box = $('rvList'); box.innerHTML = '';
    for (var k = 0; k < 3; k++) {
      var text = build(o, k, seed);
      var wrap = document.createElement('div'); wrap.className = 'lb-out';
      var h = document.createElement('h3'); h.textContent = ui('lbl')[k]; wrap.appendChild(h);
      var ta = document.createElement('textarea'); ta.value = text; ta.id = 'rvOut' + k; ta.setAttribute('aria-label', ui('lbl')[k]); ta.rows = 8;
      wrap.appendChild(ta);
      var meta = document.createElement('div'); meta.className = 'lb-meta';
      var cnt = document.createElement('span'); cnt.className = 'lb-count'; cnt.setAttribute('aria-live', 'polite');
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'lb-btn'; btn.textContent = ui('copy'); btn.setAttribute('data-label', ui('copy'));
      (function (ta, cnt, btn) {
        function upd() { cnt.textContent = ta.value.length + ' ' + ui('chars'); }
        ta.addEventListener('input', upd); upd();
        btn.addEventListener('click', function () { LB.copy(ta.value, btn); });
      })(ta, cnt, btn);
      meta.appendChild(cnt); meta.appendChild(btn); wrap.appendChild(meta);
      box.appendChild(wrap);
    }
    $('rvVar').textContent = ui('variation') + ' ' + (seed + 1);
    var notes = [];
    if (sentFromStars(o.stars) !== o.sent) notes.push(ui('mismatch'));
    if (o.cat.health) notes.push(ui('health'));
    var nb = $('rvNotes'); nb.innerHTML = '';
    notes.forEach(function (n) { var d = document.createElement('div'); d.className = 'lb-banner warn'; d.textContent = n; nb.appendChild(d); });
    $('rvResult').classList.remove('lb-hidden');
  }

  fillCats();
  $('rvLang').value = LB.lang === 'hi' ? 'hi' : 'en';
  $('rvStars').addEventListener('change', function () { if (!sentTouched) $('rvSent').value = sentFromStars(parseInt($('rvStars').value, 10)); });
  $('rvSent').addEventListener('change', function () { sentTouched = true; });
  $('rvForm').addEventListener('submit', function (e) { e.preventDefault(); seed = 0; render(); $('rvResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  $('rvRegen').addEventListener('click', function () { seed = (seed + 1) % 9; render(); });
  window.LBReply = { build: build, CATS: CATS, kwList: kwList };
})();

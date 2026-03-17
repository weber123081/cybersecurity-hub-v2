<script setup>
import { ref, computed } from 'vue';

const currentStep = ref(0);
const score = ref(0);
const showResults = ref(false);

const scenariosPool = [
  // --- A. 網路釣魚與詐騙 (1-25) ---
  { title: "網銀代碼驗證", description: "收到簡訊稱網銀需點擊連結驗證以恢復權限，連結為 https://bank-secure-verify.com。", options: [{ text: "直接開啟官方 App 查證", correct: true, feedback: "正確！網址列非銀行正式域名，多為釣魚頁面。" }, { text: "點擊並輸入帳密", correct: false, feedback: "危險！帳號將立即被盜。" }] },
  { title: "包裹配送失敗", description: "收到包裹配送失敗簡訊，要求點擊連結輸入電話號碼與地址。", options: [{ text: "不予理會或檢舉", correct: true, feedback: "正確！冒充物流是極常見的資安手法。" }, { text: "立即更新地址", correct: false, feedback: "可能導致信用卡資訊或個資外洩。" }] },
  { title: "假冒檢警監管", description: "假檢警稱您涉洗錢需「監管帳戶」，要求提供存摺與印章。", options: [{ text: "掛斷並撥打 165", correct: true, feedback: "正確！政府單位絕對不會電話監管資產。" }, { text: "配合調查", correct: false, feedback: "存款會被洗劫一空！" }] },
  { title: "高獲利投資群組", description: "LINE 廣告：『老師帶路、保證獲利，加入群組獲取飆股』。", options: [{ text: "假投資真詐騙", correct: true, feedback: "天下沒有白吃的午餐。" }, { text: "加入看看有沒有機會", correct: false, feedback: "會一步步誘導你匯款至虛擬帳戶。" }] },
  { title: "朋友借錢買點數", description: "好友突然在通訊軟體要你幫忙買點數並拍下代碼。", options: [{ text: "撥電話親自確認本人", correct: true, feedback: "帳號盜用後，冒名借錢是最常見手法。" }, { text: "馬上買給他", correct: false, feedback: "錢轉出後幾乎無法追回。" }] },
  { title: "網購分期扣款錯誤", description: "自稱電商客服稱您被誤設為批發商，會重複扣款。", options: [{ text: "掛斷並自行聯繫官方客服", correct: true, feedback: "客服不會要求您操作 ATM。" }, { text: "至 ATM 操作解除設定", correct: false, feedback: "ATM 沒有解除設定功能，那是轉帳！" }] },
  { title: "FaceBook 中獎通知", description: "標記您稱中了最新的 iPhone，要求分享並點擊連結領取。", options: [{ text: "無視並檢舉垃圾訊息", correct: true, feedback: "惡意連結常偽裝成中獎活動。" }, { text: "分享並點擊", correct: false, feedback: "會誘騙下載惡意 App。" }] },
  { title: "航空公司里程優惠", description: "網站出現過低價機票或里程兌換，要求提供全名、卡號及 CVV。", options: [{ text: "僅在官方網站交易", correct: true, feedback: "假機票網站專門收集信用卡資料。" }, { text: "趁低價搶購", correct: false, feedback: "可能導致信用卡盜刷。" }] },
  { title: "求助驗證碼", description: "親友稱手機壞了，借用你的手機收一下驗證碼。", options: [{ text: "絕對不給驗證碼", correct: true, feedback: "驗證碼通常用於重設您的帳號密碼。" }, { text: "直接給他大方幫忙", correct: false, feedback: "你的帳號隨即會被盜取。" }] },
  { title: "虛假電子發票", description: "郵件主旨：『電子發票異常，請點此重新確認』。", options: [{ text: "不點點連結，去官網或財政部確認", correct: true, feedback: "釣魚郵件常結合稅務、發票主題。" }, { text: "點開連結處理", correct: false, feedback: "可能植入勒索病毒。" }] },
  { title: "冒充 HR 入職通知", description: "收到公司 HR 寄來『本月薪資結構調整』加密附件。", options: [{ text: "先電話聯繫 HR 部門核實", correct: true, feedback: "附件常是巨集木馬。" }, { text: "直接開啟查看福利", correct: false, feedback: "可能導致辦公室電腦被入侵。" }] },
  { title: "社群軟體求讚連結", description: "好友密你：『幫我參加投票投 1 號？連結在這。』連結網址很怪。", options: [{ text: "詢問本人具體內容或不理會", correct: true, feedback: "常見盜帳號導引連結。" }, { text: "點進去幫投", correct: false, feedback: "頁面可能嵌入自動下載攻擊。" }] },
  { title: "不明來源 WiFi 分享", description: "發現有免費且不需密碼的公共 WiFi，名為『Free_Public_Wifi』。", options: [{ text: "避免連線，或連線後絕不處理金流", correct: true, feedback: "存在中間人攔截數據風險。" }, { text: "連上去省流量", correct: false, feedback: "個資極易遭竊聽。" }] },
  { title: "假冒 Netflix 訂閱過期", description: "電郵稱您的 Netflix 付款失敗，要求更新信用卡資訊。", options: [{ text: "開啟 Netflix App 查看狀態", correct: true, feedback: "不要從電郵的按鈕點進去。" }, { text: "點擊按鈕更新資訊", correct: false, feedback: "信用卡資料會外洩。" }] },
  { title: "Deepfake 視訊求援", description: "親友視訊稱急需用錢，臉部表情生硬但聲音很像。", options: [{ text: "掛斷並詢問私密問題驗證身分", correct: true, feedback: "現今出現不少深偽 AI 視訊詐騙案例。" }, { text: "馬上匯款救急", correct: false, feedback: "匯款後才發現那不是本人。" }] },
  { title: "二維碼覆蓋詐騙", description: "店家結帳 QR碼看起來不平整，似乎被貼了一層紙。", options: [{ text: "主動提醒店家並改用感應刷卡", correct: true, feedback: "這可能是『二維碼替換』詐騙。" }, { text: "照常掃碼付款", correct: false, feedback: "錢可能匯到詐騙帳戶。" }] },
  { title: "Google 警示郵件", description: "電郵稱您的帳號在陌生裝置登入，點此『變更密碼』。", options: [{ text: "手動輸入網址登入 Google 處理", correct: true, feedback: "防範假冒的警示郵件誘騙重設密碼。" }, { text: "點擊信中連結變更", correct: false, feedback: "重設流程通常是假的，目的在騙取新舊密碼。" }] },
  { title: "愛心募資詐騙", description: "臉書社團出現悲情貼文及個人匯款帳號進行非法募資。", options: [{ text: "查證勸募序號或向官方慈善機構核實", correct: true, feedback: "非正式管道的個人募資風險極高。" }, { text: "出於愛心直接匯款", correct: false, feedback: "可能成為詐騙集團的洗錢人頭。" }] },
  { title: "雲端相簿權限外洩", description: "您不小心將含有存褶、證件照的雲端空間設為『知道連結的任何人皆可查看』。", options: [{ text: "立即更改權限為『私人』", correct: true, feedback: "權限控管疏忽常導致嚴重的隱私外洩。" }, { text: "沒關係，沒人知道連結", correct: false, feedback: "連結還是可能被搜尋引擎搜尋到。" }] },
  { title: "假冒 LINE 官方通知", description: "收到帳號：『LINE 官方安全中心』簡訊，要求點擊連結解除鎖定。", options: [{ text: "查看其是否有官方認證標籤", correct: true, feedback: "LINE 官方帳號通常有專屬綠/藍色盾牌標章。" }, { text: "立即點擊處理", correct: false, feedback: "可能導致全家人的群組被盜用。" }] },

  // --- B. 設備與帳號安全 (26-50) ---
  { title: "公共 USB 充電站", description: "發現百貨公司提供免費 USB 插座，正確用法為何？", options: [{ text: "使用自帶充電線外加『電力阻斷器』", correct: true, feedback: "避免 Juice Jacking 數據注入攻擊。" }, { text: "直接插入手機", correct: false, feedback: "數據可能被非法擷取。" }] },
  { title: "舊手機拋棄前", description: "舊手機準備賣掉，應執行何種動作？", options: [{ text: "重置為原廠設定並加密擦除", correct: true, feedback: "單純刪除照片無法徹底移除數據。" }, { text: "刪除對話紀錄即可", correct: false, feedback: "大部分資料依然留在儲存空間。" }] },
  { title: "強密碼組成", description: "下列何種長度與組合更具安全性？", options: [{ text: "長度 12 位、含雜湊大小寫及符號", correct: true, feedback: "密碼長度與複雜度是暴力破解的核心門檻。" }, { text: "常用單字加 12345", correct: false, feedback: "這種規則極易被社交工程或字典攻擊破解。" }] },
  { title: "兩步驟驗證 (2FA)", description: "除了密碼，多開一個簡訊或 Authenticator 驗證的優點？", options: [{ text: "密碼外洩時多一重登入門檻", correct: true, feedback: "這是現代防止盜帳號最有感的方法。" }, { text: "讓登入變麻煩", correct: false, feedback: "麻煩是變安全的小代價。" }] },
  { title: "電腦安全性更新", description: "發現軟體有系統安全性修補程式建議安裝，應：", options: [{ text: "儘快備份後更新", correct: true, feedback: "修補漏洞是防禦核心。" }, { text: "有空再說，目前很順", correct: false, feedback: "漏洞一旦公開，即成為駭客攻擊點。" }] },
  { title: "App 必要權限檢查", description: "記帳 App 要求存取相機、撥打電話與位置權限，應該？", options: [{ text: "拒絕授權或解除安裝", correct: true, feedback: "不合理的權限要求常伴隨隱私竊取。" }, { text: "全選允許方便使用", correct: false, feedback: "提供超出功能的個資授權很危險。" }] },
  { title: "公共電腦登入後", description: "在影印店或公用電腦登入郵箱，完畢後：", options: [{ text: "確定登出並清除隱身模式瀏覽紀錄", correct: true, feedback: "預防後續使用者自動登入。" }, { text: "關閉分頁就好", correct: false, feedback: "Session 可能仍然有效。" }] },
  { title: "IoT 智慧攝影機設定", description: "家裡裝好網路監視器後，第一個重要動作？", options: [{ text: "更改預設管理員密碼", correct: true, feedback: "預設密碼常被公開於自動入侵庫中。" }, { text: "直接分享給全家人", correct: false, feedback: "若被入侵，全家人的隱私會曝光。" }] },
  { title: "藍牙常駐啟動", description: "平時沒用到藍牙時，建議：", options: [{ text: "關閉藍牙功能", correct: true, feedback: "降低被 BlueBorne 等無線攻擊的風險。" }, { text: "一直開著比較方便", correct: false, feedback: "可能導致裝置被追蹤或嘗試連線。" }] },
  { title: "螢幕防窺片作用", description: "主要用於防止哪種類型的威脅？", options: [{ text: "防止身後的人窺視螢幕內容", correct: true, feedback: "保護實體環境下的隱私資訊。" }, { text: "防止電腦藍光傷眼", correct: false, feedback: "那是抗藍光片的功能。" }] },
  { title: "遺失隨身碟處理", description: "發現公司地板有一支隨身碟，應該？", options: [{ text: "交給資安或總務部門", correct: true, feedback: "預防 USB Drop 散播木馬攻擊。" }, { text: "順手撿來自己用", correct: false, feedback: "插上電腦可能全屏中毒。" }] },
  { title: "指紋/臉部辨識角色", description: "在手機安全中，生物辨識主要的優點？", options: [{ text: "便捷且難以被近距離窺視密碼", correct: true, feedback: "優化體驗並降低偷窺風險。" }, { text: "絕對不可被複製", correct: false, feedback: "生物資訊還是有偽造或被竊取可能。" }] },
  { title: "路由器預設網頁", description: "路由器設定頁面的控制權？", options: [{ text: "應手動更換強度高的密碼", correct: true, feedback: "防止外部滲透入侵家用網路。" }, { text: "保持為 admin/password 方便記憶", correct: false, feedback: "這等於把門鎖鑰匙插在門口。" }] },
  { title: "軟體安裝來源", description: "下載電腦軟體最安全的選項？", options: [{ text: "前往官方網頁或正式商店下載", correct: true, feedback: "避免下載帶有第三方木馬的破解版軟體。" }, { text: "Google 搜尋排名最高的不明載點", correct: false, feedback: "許多載點帶有廣告軟體或間諜程式。" }] },
  { title: "瀏覽器外掛控制", description: "對於安裝的大量 Chrome 擴充功能，應？", options: [{ text: "平時停用不必要的插件，並定期清理", correct: true, feedback: "過期或遭惡意接管的擴充常有資安風險。" }, { text: "越多越好能增加功能", correct: false, feedback: "每個外掛都有讀取您瀏覽數據的權利。" }] },
  { title: "工作筆電遺失處理", description: "筆電在通勤途中不慎遺失，第一時間應？", options: [{ text: "通報公司 IT 並執行遠端抹除身分鎖定", correct: true, feedback: "避免硬碟內的機密資料外洩。" }, { text: "先發文問路人有沒有撿到", correct: false, feedback: "這緩慢且無法保證資料安全。" }] },
  { title: "雲端帳號權限細節", description: "如果要分享單一檔案給外人，應：", options: [{ text: "僅開放該特定檔案的連結", correct: true, feedback: "避免誤將整個資料夾設為公開。" }, { text: "帳號密碼借他一下，看完再改", correct: false, feedback: "絕對不該分享個人主帳號密碼。" }] },
  { title: "手機作業系統版本", description: "您的手機過舊已無法更新 OS 安全更新，該？", options: [{ text: "考慮更換新機避免漏洞無法修補", correct: true, feedback: "過時設備是資安的一大死角。" }, { text: "這代表系統很穩不用再動", correct: false, feedback: "危險，代表你每天在已知漏洞下裸奔。" }] },
  { title: "HTTPS 安全與憑證", description: "瀏覽時發現『連線不安全』、『網頁憑證過期』，應：", options: [{ text: "停止繼續瀏覽該網頁", correct: true, feedback: "傳輸內容極可能被竄改或攔截。" }, { text: "點擊進階強行進入", correct: false, feedback: "可能會被引入駭客偽造的站點。" }] },
  { title: "加密通訊選擇", description: "要討論極具機密性的事項，建議？", options: [{ text: "使用具備點對點加密 (E2EE) 的通訊 App", correct: true, feedback: "確保中間端（包含供應商）皆無法查看。" }, { text: "直接在臉書社團公開留言", correct: false, feedback: "毫無隱私可言。" }] },

  // --- C. 隱私權與個資防護 (51-75) ---
  { title: "電子發票手機條碼密碼", description: "關於載具密碼的設定，下列行為何者正確？", options: [{ text: "與銀行密碼區分，並定期更換", correct: true, feedback: "不要一組密碼走天下。" }, { text: "設為 0000 方便店員刷", correct: false, feedback: "那是解鎖密碼，這會導致載具內資料易遭侵害。" }] },
  { title: "地址標籤處理", description: "網購紙箱外的個資貼紙，丟棄前應？", options: [{ text: "先撕掉、碎紙或塗黑", correct: true, feedback: "預防垃圾桶盜用個資風險。" }, { text: "直接丟入回收籃", correct: false, feedback: "資料隨時能被拾荒者收集。" }] },
  { title: "社群網站姓名透露", description: "在個人檔案中揭露全名、生日與現職工作，風險是？", options: [{ text: "方便駭客精準進行社交工程釣魚", correct: true, feedback: "越透明的資訊越易成為被鎖定目標。" }, { text: "增加權威性", correct: false, feedback: "同時也犧牲了大量隱私。" }] },
  { title: "應用程式定位權限", description: "當影片裁切 App 要求『永遠存取位置』時，這？", options: [{ text: "不合理，應改為『僅使用期間存取』或拒絕", correct: true, feedback: "應用程式不應追蹤用戶沒在使用的位置。" }, { text: "為了剪輯更高畫質", correct: false, feedback: "位置與畫質毫無關聯。" }] },
  { title: "Cookies 清理習慣", description: "定期清理瀏覽器 Cookies 的主要好處？", options: [{ text: "降低被網站廣告精準追蹤的可能", correct: true, feedback: "保護個人網路行為偏好隱私。" }, { text: "網路速度變快三倍", correct: false, feedback: "其實清理後重新載入會稍慢。" }] },
  { title: "免洗信箱運用", description: "要註冊一個只用一次的論壇，可選？", options: [{ text: "使用臨時性的免洗信箱 (Temp Mail)", correct: true, feedback: "防止主信箱後續收到垃圾信或外洩資料。" }, { text: "使用常用的 Google 帳號直接登入", correct: false, feedback: "這會讓論壇獲取您的基本個資。" }] },
  { title: "手機應用鎖作用", description: "幫特定 App (如 LINE、相簿) 設定個別啟動密碼，是為了：", options: [{ text: "增加實體的第二線防禦，避免手機借人後隱私曝光", correct: true, feedback: "手機解鎖後不代表內部 Ap p也該全開。" }, { text: "讓手機更省電", correct: false, feedback: "其實會略耗一些極微量電力。" }] },
  { title: "網購付款方式偏好", description: "在較不知名的購物站，較安全的付款做法？", options: [{ text: "使用虛擬信用卡或選貨到付款", correct: true, feedback: "保護主信用卡號免於外洩。" }, { text: "直接輸入薪轉戶的提款卡號碼", correct: false, feedback: "若外洩，帳戶金額可能瞬間歸零。" }] },
  { title: "瀏覽隱身模式限制", description: "開啟『無痕模式』是否能隱藏網路活動予 ISP 公司？", options: [{ text: "不能，服務供應商(ISP)依然能看見請求紀錄", correct: true, feedback: "無痕僅限於不留在本機歷史紀錄中。" }, { text: "可以，這是絕對隱私", correct: false, feedback: "這是對於隱身模式的常見誤區。" }] },
  { title: "公開發表評論個資", description: "在 YouTube 下方留言回覆手機號碼或地址，這：", options: [{ text: "極具風險，應立即刪除", correct: true, feedback: "公開平台的資料會被大量機器人抓取。" }, { text: "沒關係，沒人認識我", correct: false, feedback: "攻擊者不需要認識你也能詐騙你。" }] },
  { title: "電子信箱自動轉寄", description: "檢查信箱設定時發現多了莫名的轉寄規則，這代表？", options: [{ text: "帳號可能已遭入侵並在監控您的信件", correct: true, feedback: "這是駭客維持後門的常見手段。" }, { text: "信箱空間不足的警示", correct: false, feedback: "空間問題不會出現自動轉寄設定。" }] },
  { title: "密碼管理員安全性", description: "使用主密碼保護的密碼管理工具，主要優點：", options: [{ text: "只需記一組強密碼，提升整體強度", correct: true, feedback: "解決多平台密碼難以記憶的問題。" }, { text: "自動幫我登入駭客網站", correct: false, feedback: "這並非工具的功能。" }] },
  { title: "生物特徵數據疑慮", description: "將指紋上傳至雲端同步的壞處？", options: [{ text: "若雲端主機遭駭，指紋資訊無法更換", correct: true, feedback: "生日可改，密碼可變，生物特徵被盜則是一輩子。" }, { text: "指紋變多會導致辨識變慢", correct: false, feedback: "目前的硬體運算已能忽略此影響。" }] },
  { title: "隱私權政策閱讀", description: "同意條款前，最應關注的關鍵字？", options: [{ text: "『與第三方夥伴分享』、『廣告行銷目的』", correct: true, feedback: "這與您的各項數據去向息息相關。" }, { text: "『免收費』三個字", correct: false, feedback: "免收費通常代表您就是產品（數據提供者）。" }] },
  { title: "背景數據傳輸內容", description: "睡覺時手機莫名發燙且消耗流量過多，可能是？", options: [{ text: "背後程式正在執行大量不尋常的上傳/挖礦", correct: true, feedback: "手機中毒或被控為殭屍網路的徵兆。" }, { text: "天氣變熱", correct: false, feedback: "這是不正常的軟體行為。" }] },

  // --- D. 社交工程與職場情境 (76-100) ---
  { title: "假冒快遞收件人", description: "辦公室櫃台收到件，要求您簽收並代付 500 元運費，但物主不再位子上。", options: [{ text: "請其晚點再來或先電話確認物主", correct: true, feedback: "常見的小額快遞代收詐騙。" }, { text: "先代墊並簽收", correct: false, feedback: "打開可能發現只是垃圾紙張。" }] },
  { title: "自稱微軟工程師系統報修", description: "接到英文電話報稱您的 Windows 系統有病毒需提供遠端連線權限。", options: [{ text: "立即掛斷，微軟不會主動來電報修", correct: true, feedback: "這是大規模跨國詐騙常見腳本。" }, { text: "配合提供遠端連線代碼", correct: false, feedback: "駭客會鎖死您的電腦並勒索金額。" }] },
  { title: "離職前資安責任", description: "關於公司內部的各項密碼、電子憑證，應：", options: [{ text: "全數繳回或交接並作廢權限", correct: true, feedback: "離職不應帶走或保留任何公務資料。" }, { text: "自己備份一份帶回家作紀念", correct: false, feedback: "這可能構成侵害營業秘密或違反資安法。" }] },
  { title: "假冒公司公告", description: "佈告欄貼著：『所有同仁請至此網址更新個人病假資訊。』連結並非公司入口網。", options: [{ text: "向資訊單位檢舉此不明告示", correct: true, feedback: "實體環境也會被植入假連結。" }, { text: "乖乖進去填寫", correct: false, feedback: "帳密可能被盜用並入侵內部網路。" }] },
  { title: "面試個資保護", description: "投遞職缺後，對方要求先提供健保卡與存摺正本代為保管，應：", options: [{ text: "拒絕提供，證件不應離身", correct: true, feedback: "正常的公司不會要求留存正本原件。" }, { text: "配合以顯示誠意", correct: false, feedback: "可能遭盜用辦理門號或非法借貸。" }] },
  { title: "陌生人求助網路分享", description: "路人稱手機沒網路求你分享 Hotspot，這？", options: [{ text: "基於安全考量禮貌拒絕", correct: true, feedback: "不隨便分享熱點，以免對方利用你的門號違法或監聽。" }, { text: "大方分享，助人為樂", correct: false, feedback: "對方若從事非法活動，門號主是你。" }] },
  { title: "電競周邊硬體安全", description: "新買的滑鼠驅動程式要求停用防火牆才能執行，該？", options: [{ text: "尋找其他品牌或官方正式版", correct: true, feedback: "不應為了遊戲體驗犧牲系統防護。" }, { text: "配合停用", correct: false, feedback: "可能成為駭客進入內網的捷徑。" }] },
  { title: "語音釣魚辨識", description: "自動語音電話：『您有一張健保卡逾期未付，請按 9 由專人接聽...』，應：", options: [{ text: "直接掛斷", correct: true, feedback: "健保單位或司法單位不會電話要求按鍵轉接專人。" }, { text: "按 9 聽聽對方說什麼", correct: false, feedback: "這會將您標記為高價值目標進行後續詐騙。" }] },
  { title: "職場電腦共享帳號", description: "多名同仁共用一個帳號登入系統，壞處是？", options: [{ text: "權責不分，無法追蹤誰操作了錯誤", correct: true, feedback: "單一帳號原則是審計安全的關鍵。" }, { text: "可以省下帳號授權費", correct: false, feedback: "這在安全性上是巨大的漏洞。" }] },
  { title: "網路霸凌與個資", description: "在討論版被激怒，想肉搜並公開別人住址，這代表？", options: [{ text: "同樣違反個資保護法與刑法", correct: true, feedback: "正當護衛不應採非法手段。" }, { text: "正義感爆棚的行為", correct: false, feedback: "這是嚴重的資安與法律違規。" }] },
  { title: "會議軟體共用螢幕", description: "在線上會議分享螢幕時，建議：", options: [{ text: "僅分享特定應用程式視窗，而非整個桌面", correct: true, feedback: "避免不經意撇見通知或機密文件內容。" }, { text: "全屏分享最清楚", correct: false, feedback: "可能讓他人在螢幕側邊看到隱私通知。" }] },
  { title: "USB 鍵盤側錄器實體檢查", description: "發現電腦後方的鍵盤線多接了一個不明的小插頭，這可能是？", options: [{ text: "訊號增強器", correct: false, feedback: "更多是實體鍵盤紀錄器 (Keylogger)。" }, { text: "硬體側錄裝置，應立即通報資安", correct: true, feedback: "它可以完整擷取每一鍵包含密碼。" }] },
  { title: "公共電視盒風險", description: "飯店電視支援手機投射，應注意：", options: [{ text: "使用後確認斷開連線且未暫存帳號", correct: true, feedback: "避免下一房客透過電視看見你的資料。" }, { text: "隨便投影沒差", correct: false, feedback: "可能留下登入紀錄或投影歷史。" }] },
  { title: "假冒微軟/Google 技術支持", description: "彈出視窗稱『偵測到您的瀏覽器受損，請撥打 0800...』，應：", options: [{ text: "無視彈窗，直接關閉瀏覽器", correct: true, feedback: "網頁端無法自動診斷這類報警。" }, { text: "趕快撥打電話求救", correct: false, feedback: "那是假專線，目的是騙你買假軟體或提供卡號。" }] },
  { title: "社交與標記隱私", description: "好友在打卡貼文中標記了您，這會造成：", options: [{ text: "向外界暴露您的行蹤資訊", correct: true, feedback: "建議設定為『需核准才顯示在個人主頁』。" }, { text: "增加知名度", correct: false, feedback: "但也增加被鎖定攻擊的精確度。" }] },

  // --- E. 綜合防護 (101-110) ---
  { title: "區塊鏈錢包私鑰", description: "有人稱『幫我檢查錢包，我把私鑰(Seed Phrase)給你』，這可能是？", options: [{ text: "新型釣魚，誘騙您匯款測試資產", correct: true, feedback: "私鑰是資產唯一鑰匙，任何形式的要求都要警覺。" }, { text: "發財的好機會", correct: false, feedback: "錢包通常是空的且帶有連鎖病毒。" }] },
  { title: "手機遺失鎖定", description: "Android 遺失後，可透過何種功能找回或消除？", options: [{ text: "Find My Device (尋找我的裝置)", correct: true, feedback: "這是內建的重要安全防護入口。" }, { text: "打電話給通訊行", correct: false, feedback: "通訊行通常無權限定位個人帳號。" }] },
  { title: "AI 回覆陷阱", description: "AI 客服一直要求您上傳正面證件照以利開通服務，該？", options: [{ text: "確認平台可信度，非必要不上傳敏感照", correct: true, feedback: "數位身分竊取是現今重大威脅。" }, { text: "AI 不會騙人，直接上傳", correct: false, feedback: "背後的開發者或數據庫仍有外洩風險。" }] },
  { title: "信用卡 NFC 防盜", description: "NFC 信用卡放在錢包外層，可能被有心人：", options: [{ text: "透過感應器近距離竊取卡號", correct: true, feedback: "建議使用具備 RFID 遮蔽功能的錢包。" }, { text: "讓卡片更容易感應到店員", correct: false, feedback: "這確實是優點但有資安隱憂。" }] },
  { title: "網路數位足跡", description: "在各網站留下的評論、按讚紀錄，應：", options: [{ text: "定期自我搜尋並審視是否過度暴露偏好", correct: true, feedback: "數位足跡一旦形成很難完全消失。" }, { text: "由它去，這就是大數據", correct: false, feedback: "會直接被廣告商或駭客畫像工具利用。" }] },
  { title: "物聯網門鎖密鑰", description: "電子門鎖支援 APP 遠端開門，正確做法是？", options: [{ text: "僅在絕對必要時遠端授權，並隨時檢查紀錄", correct: true, feedback: "便利性背後伴隨著家庭實體入侵風險。" }, { text: "不設密碼直接一按即開", correct: false, feedback: "等於讓整條街的人都能進你家。" }] },
  { title: "密碼提示問題", description: "設定『母親的名字』作為密碼提示問題，這安全嗎？", options: [{ text: "不安全，社交工程輕易能查出此答案", correct: true, feedback: "提示問題應設為僅有你知悉的獨特答案。" }, { text: "很安全，因為只有親戚知道", correct: false, feedback: "現在肉搜非常容易得知這類資訊。" }] },
  { title: "手機應用安裝權限：來源不明", description: "對第三方 APK 或不知名載點的 App 維持：", options: [{ text: "不下載、不安裝的原則", correct: true, feedback: "這是移動設備中毒最主要的來源。" }, { text: "可以試看看再刪掉", correct: false, feedback: "安裝當下可能已經植入系統層後門。" }] },
  { title: "公文附件格式", description: "公司內部最不建議用哪種方式傳遞機密文件？", options: [{ text: "透過通訊軟體的私人雲端硬碟直接分享", correct: true, feedback: "應使用具備審核紀錄的正式內網平台。" }, { text: "放在加密後的 ZIP 並分別寄送密碼", correct: false, feedback: "這在傳統做法上仍具一定保護力。" }] },
  { title: "結論：資安意識核心", description: "哪一個是預防資安危害的最強盾牌？", options: [{ text: "強大的防毒軟體", correct: false, feedback: "軟體雖重要但無法防範所有社交工程。" }, { text: "每個使用者本身的高度警覺性與正確知識", correct: true, feedback: "正確！人才是資安守備中最重要也最弱的一環。" }] }
];

const scenarios = ref([]);
const userAnswers = ref([]); 
const quizHistory = ref(JSON.parse(localStorage.getItem('cyberhub_quiz_history') || '[]'));
const viewMode = ref('quiz'); // 'quiz' or 'history'

function initQuiz() {
  scenarios.value = [...scenariosPool]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  currentStep.value = 0;
  score.value = 0;
  showResults.value = false;
  userAnswers.value = [];
  viewMode.value = 'quiz';
}

initQuiz();

function handleAnswer(opt) {
  userAnswers.value.push({
    title: scenarios.value[currentStep.value].title,
    description: scenarios.value[currentStep.value].description,
    allOptions: JSON.parse(JSON.stringify(scenarios.value[currentStep.value].options)), // Capture all options
    userChoiceToken: opt.text, // Store the text of what was chosen
    correct: opt.correct,
    feedback: opt.feedback,
    correctAnswerToken: scenarios.value[currentStep.value].options.find(o => o.correct)?.text
  });

  if (opt.correct) {
    score.value += 1;
  }
  
  if (currentStep.value < scenarios.value.length - 1) {
    currentStep.value++;
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  showResults.value = true;
  const newRecord = {
    date: new Date().toLocaleString(),
    score: score.value,
    total: scenarios.value.length,
    answers: [...userAnswers.value]
  };
  quizHistory.value.unshift(newRecord);
  // Keep only last 20 records
  if (quizHistory.value.length > 20) quizHistory.value.pop();
  localStorage.setItem('cyberhub_quiz_history', JSON.stringify(quizHistory.value));
}

function restart() {
  initQuiz();
}

const incorrectAnswers = computed(() => {
  return userAnswers.value.filter(ans => !ans.correct);
});

function clearHistory() {
  if (confirm('確定要清除所有歷史紀錄嗎？')) {
    quizHistory.value = [];
    localStorage.removeItem('cyberhub_quiz_history');
  }
}
</script>

<template>
  <div class="lab-container">
    <header class="page-header">
      <h1><i class="fa-solid fa-flask"></i> 實戰演練實驗室</h1>
      <p>擁有超過 110+ 道專業實戰題庫，每次隨機挑戰 5 關</p>
      <div class="header-nav">
        <button 
          :class="['nav-tab', { active: viewMode === 'quiz' }]"
          @click="viewMode = 'quiz'"
        >
          即時測驗
        </button>
        <button 
          :class="['nav-tab', { active: viewMode === 'history' }]"
          @click="viewMode = 'history'"
        >
          歷史紀錄 ({{ quizHistory.length }})
        </button>
      </div>
    </header>

    <!-- Quiz View -->
    <div v-if="viewMode === 'quiz'">
      <div v-if="!showResults" class="quiz-card widget">
        <div class="quiz-header">
          <div class="header-top">
            <span class="step-indicator">情境 {{ currentStep + 1 }} / {{ scenarios.length }}</span>
            <span class="pool-info">總題庫: {{ scenariosPool.length }} 題</span>
          </div>
          <h2>{{ scenarios[currentStep]?.title }}</h2>
        </div>
        
        <div class="quiz-body">
          <p class="description">{{ scenarios[currentStep]?.description }}</p>
          <div class="options-grid">
            <button 
              v-for="(opt, idx) in scenarios[currentStep]?.options" 
              :key="idx"
              class="option-btn"
              @click="handleAnswer(opt)"
            >
              {{ opt.text }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="results-card widget">
        <i class="fa-solid fa-trophy trophy-icon"></i>
        <h2>測驗完成！</h2>
        <div class="score-display">
          得分：<span>{{ score }}</span> / {{ scenarios.length }}
        </div>

        <div v-if="incorrectAnswers.length > 0" class="review-section">
          <h3><i class="fa-solid fa-circle-exclamation"></i> 錯題深度回顧</h3>
          <p class="review-hint">查看題目、所有選項及您的選擇細節：</p>
          <div class="error-list">
            <div v-for="(ans, idx) in incorrectAnswers" :key="idx" class="error-item">
              <div class="error-q">
                <span class="q-tag">題目</span>
                {{ ans.title }}: {{ ans.description }}
              </div>
              
              <div class="full-options-review">
                <div 
                  v-for="(opt, oidx) in ans.allOptions" 
                  :key="oidx" 
                  class="review-opt-box"
                  :class="{ 
                    'user-picked': opt.text === ans.userChoiceToken,
                    'correct-opt': opt.text === ans.correctAnswerToken 
                  }"
                >
                  <div class="opt-status-icon">
                    <i v-if="opt.text === ans.correctAnswerToken" class="fa-solid fa-circle-check"></i>
                    <i v-else-if="opt.text === ans.userChoiceToken" class="fa-solid fa-circle-xmark"></i>
                    <i v-else class="fa-regular fa-circle"></i>
                  </div>
                  <div class="opt-text">{{ opt.text }}</div>
                  <div v-if="opt.text === ans.userChoiceToken" class="choice-label">您的選擇</div>
                </div>
              </div>

              <div class="error-feedback">
                <span class="label">專家解析</span>
                <p>{{ ans.feedback }}</p>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="perfect-score">
          <i class="fa-solid fa-star"></i> 太棒了！全部答對，資安防護滿分！
        </div>

        <div class="stats-footer">
          測驗成績已存入歷史紀錄，您可以隨時切換分頁查看。
        </div>
        <div class="action-btns">
          <button class="restart-btn" @click="restart">
            <i class="fa-solid fa-rotate-right"></i> 重新開始
          </button>
        </div>
      </div>
    </div>

    <!-- History View -->
    <div v-if="viewMode === 'history'" class="history-view widget">
      <div class="history-header">
        <h2><i class="fa-solid fa-clock-rotate-left"></i> 歷史測驗成績</h2>
        <button v-if="quizHistory.length > 0" class="clear-btn" @click="clearHistory">清除紀錄</button>
      </div>

      <div v-if="quizHistory.length === 0" class="empty-history">
        <i class="fa-solid fa-ghost"></i>
        <p>尚無歷史測驗紀錄，去進行一場測驗吧！</p>
        <button @click="viewMode = 'quiz'" class="restart-btn">發起挑戰</button>
      </div>

      <div v-else class="history-list">
        <div v-for="(record, idx) in quizHistory" :key="idx" class="history-item">
          <div class="history-top">
            <span class="date">{{ record.date }}</span>
            <span class="score" :class="{ perfect: record.score === record.total }">
              {{ record.score }} / {{ record.total }}
            </span>
          </div>
          <details class="history-details">
            <summary>查看詳細答題紀錄 (含完整選項)</summary>
            <div class="history-detail-list">
              <div v-for="(ans, aidx) in record.answers" :key="aidx" class="h-ans-item" :class="{ correct: ans.correct }">
                <div class="h-ans-q">{{ ans.title }}: {{ ans.description }}</div>
                
                <div v-if="ans.allOptions" class="h-options-grid">
                  <div 
                    v-for="(opt, oidx) in ans.allOptions" 
                    :key="oidx" 
                    class="h-opt-mini"
                    :class="{ 
                      'u-pick': opt.text === ans.userChoiceToken,
                      'c-pick': opt.text === ans.correctAnswerToken 
                    }"
                  >
                    <i v-if="opt.text === ans.correctAnswerToken" class="fa-solid fa-check"></i>
                    <i v-else-if="opt.text === ans.userChoiceToken" class="fa-solid fa-xmark"></i>
                    {{ opt.text }}
                    <span v-if="opt.text === ans.userChoiceToken" class="u-tag">您選的</span>
                  </div>
                </div>
                <div v-else class="h-ans-res">
                   選擇：{{ ans.userChoiceToken }}
                </div>

                <div v-if="!ans.correct" class="h-ans-feedback">
                  <b>解析：</b>{{ ans.feedback }}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lab-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 5rem 1.5rem 3rem;
}

.header-nav {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
}

.nav-tab {
  padding: 0.6rem 2rem;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  border-radius: 30px;
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: 600;
  transition: all 0.2s;
}

.nav-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.page-header {
  margin-bottom: 2.5rem;
  text-align: center;
}

.page-header h1 {
  font-size: 2.25rem;
  color: var(--primary-color);
  margin-bottom: 0.5rem;
}

.page-header p {
  color: var(--text-secondary);
}

.quiz-card, .results-card, .history-view {
  padding: 2rem;
  animation: slideIn 0.4s ease-out;
}

.quiz-header {
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.step-indicator {
  font-size: 0.9rem;
  color: var(--primary-color);
  font-weight: 700;
}

.pool-info {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.description {
  font-size: 1.25rem;
  line-height: 1.6;
  margin-bottom: 2rem;
  color: var(--text-primary);
}

.options-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.option-btn {
  padding: 1.25rem;
  text-align: left;
  border: 1px solid var(--border-color);
  background: var(--bg-main);
  border-radius: 12px;
  cursor: pointer;
  font-size: 1.05rem;
  transition: all 0.2s;
  color: var(--text-primary);
}

.option-btn:hover {
  border-color: var(--primary-color);
  background: var(--bg-card);
  transform: translateX(10px);
}

.results-card {
  text-align: center;
}

.review-section {
  text-align: left;
  margin-top: 2rem;
  background: var(--bg-card);
  padding: 2rem;
  border-radius: 20px;
  border: 1px solid var(--border-color);
}

.review-section h3 {
  color: #e74c3c;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.review-hint {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 1.5rem;
}

.full-options-review {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
  margin-bottom: 1.5rem;
}

.review-opt-box {
  display: flex;
  align-items: center;
  padding: 1rem;
  background: var(--bg-main);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  gap: 1rem;
  position: relative;
  transition: all 0.2s;
}

.review-opt-box.user-picked {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.05);
}

.review-opt-box.correct-opt {
  border-color: #2ecc71;
  background: rgba(46, 204, 113, 0.05);
  box-shadow: 0 0 10px rgba(46, 204, 113, 0.1);
}

.opt-status-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.correct-opt .opt-status-icon { color: #2ecc71; }
.user-picked .opt-status-icon { color: #e74c3c; }

.opt-text {
  font-size: 1rem;
  font-weight: 500;
  flex-grow: 1;
}

.choice-label {
  font-size: 0.75rem;
  font-weight: 800;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}

.error-feedback .label {
  font-weight: 700;
  color: var(--primary-color);
  margin-bottom: 4px;
  display: block;
}

.error-item {
  padding-bottom: 2rem;
  border-bottom: 2px solid var(--border-color);
}

.error-q {
  font-weight: 700;
  margin-bottom: 1.5rem;
  font-size: 1.15rem;
  color: var(--text-primary);
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  line-height: 1.5;
}

.q-tag {
  background: var(--primary-color);
  color: white;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 4px;
}

/* History Mini Grid */
.h-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  margin: 1rem 0;
}

.h-opt-mini {
  font-size: 0.9rem;
  padding: 0.6rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-secondary);
}

.h-opt-mini.u-pick {
  border-color: #e74c3c;
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.05);
}

.h-opt-mini.c-pick {
  border-color: #2ecc71;
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.05);
}

.h-opt-mini i {
  font-size: 0.8rem;
}

.u-tag {
  font-size: 0.7rem;
  background: #e74c3c;
  color: white;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: auto;
  font-weight: 700;
}

.perfect-score {
  padding: 2rem;
  background: rgba(46, 204, 113, 0.1);
  border-radius: 16px;
  color: #2ecc71;
  font-weight: 700;
  font-size: 1.2rem;
  margin: 2rem 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.clear-btn {
  background: none;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-item {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  padding: 1.5rem;
  border-radius: 12px;
  text-align: left;
}

.history-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.history-top .date {
  color: var(--text-secondary);
  font-weight: 500;
}

.history-top .score {
  font-weight: 700;
  font-size: 1.2rem;
}

.history-top .score.perfect {
  color: #2ecc71;
}

.history-details summary {
  cursor: pointer;
  color: var(--primary-color);
  font-weight: 600;
  outline: none;
}

.history-detail-list {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.h-ans-item {
  padding: 1rem;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.h-ans-item.correct {
  border-left: 4px solid #2ecc71;
}

.h-ans-item:not(.correct) {
  border-left: 4px solid #e74c3c;
}

.h-ans-q {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.h-ans-res {
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-tag {
  font-size: 0.75rem;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
}

.status-tag.ok {
  background: #2ecc71;
  color: white;
}

.status-tag.err {
  background: #e74c3c;
  color: white;
}

.h-ans-feedback {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.trophy-icon {
  font-size: 4rem;
  color: #f1c40f;
  margin-bottom: 1rem;
}

.score-display span {
  font-size: 3.5rem;
  font-weight: 800;
  color: var(--primary-color);
}

.restart-btn {
  padding: 0.8rem 2rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.empty-history {
  padding: 4rem 0;
  color: var(--text-secondary);
}

.empty-history i {
  font-size: 4rem;
  margin-bottom: 1rem;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

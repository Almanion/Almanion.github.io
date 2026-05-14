// ========== ДАННЫЕ ПЕРСОНАЖЕЙ ==========
// Содержание персонажей загружается из data/landowners/*.js, data/officials/*.js, data/chichikov.js
// Каждый файл регистрирует себя через CHARACTERS['id'] = {...}
const CHARACTERS = {};

// ========== ТЕКСТ ПРОИЗВЕДЕНИЯ ==========
// Главы загружаются из text/chapter-N.txt (абзацы разделены пустой строкой).
// Ниже — встроенные фрагменты (fallback, если fetch не удался или файлы пустые).
// Важно: при открытии страницы как file:// многие браузеры не дают fetch() читать
// соседние файлы — тогда всегда показывается этот fallback. Откройте сайт через
// локальный HTTP-сервер (например: npx serve . в папке проекта).

let TEXT_CHAPTERS = [];
let _chaptersLoaded = false;

const CHAPTER_META = {
  1:  { title: 'Глава первая',        summary: 'Приезд Чичикова в город NN. Знакомство с чиновниками.' },
  2:  { title: 'Глава вторая',        summary: 'Визит к Манилову.' },
  3:  { title: 'Глава третья',        summary: 'Визит к Коробочке.' },
  4:  { title: 'Глава четвёртая',     summary: 'Визит к Ноздрёву.' },
  5:  { title: 'Глава пятая',         summary: 'Визит к Собакевичу.' },
  6:  { title: 'Глава шестая',        summary: 'Визит к Плюшкину.' },
  7:  { title: 'Глава седьмая',       summary: 'Оформление купчих крепостей.' },
  8:  { title: 'Глава восьмая',       summary: 'Бал у губернатора. Слухи о богатстве Чичикова.' },
  9:  { title: 'Глава девятая',       summary: 'Распространение слухов. Город обсуждает Чичикова.' },
  10: { title: 'Глава десятая',       summary: 'Чиновники в панике. Версия о капитане Копейкине.' },
  11: { title: 'Глава одиннадцатая',  summary: 'Биография Чичикова. Бегство из города.' }
};

async function loadChapters() {
  if (_chaptersLoaded) return TEXT_CHAPTERS;
  const promises = [];
  for (let i = 1; i <= 11; i++) {
    promises.push(
      fetch(`text/chapter-${i}.txt`, { cache: 'no-store' })
        .then(r => r.ok ? r.text() : null)
        .catch(() => null)
    );
  }
  const results = await Promise.all(promises);
  const loaded = [];
  results.forEach((text, idx) => {
    const num = idx + 1;
    if (!text || text.trim().length === 0) return;
    if (text.includes('Вставьте сюда')) return;
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(p => p.replace(/\n/g, ' ').trim())
      .filter(p => p.length > 0);
    if (paragraphs.length === 0) return;
    const meta = CHAPTER_META[num] || {};
    loaded.push({
      number: num,
      title: meta.title || `Глава ${num}`,
      summary: meta.summary || '',
      paragraphs
    });
  });
  if (loaded.length > 0) {
    TEXT_CHAPTERS = loaded.sort((a, b) => a.number - b.number);
  } else {
    TEXT_CHAPTERS = _FALLBACK_CHAPTERS;
  }
  _chaptersLoaded = true;
  return TEXT_CHAPTERS;
}

const _FALLBACK_CHAPTERS = [
  {
    number: 1,
    title: 'Глава первая',
    summary: 'Приезд Чичикова в город NN. Знакомство с чиновниками.',
    paragraphs: [
      'В ворота гостиницы губернского города NN въехала довольно красивая рессорная небольшая бричка, в какой ездят холостяки: отставные подполковники, штабс-капитаны, помещики, имеющие около сотни душ крестьян, — словом, все те, которых называют господами средней руки. В бричке сидел господин, не красавец, но и не дурной наружности, ни слишком толст, ни слишком тонок; нельзя сказать, чтобы стар, однако ж и не так, чтобы слишком молод. Въезд его не произвёл в городе совершенно никакого шума и не был сопровождён ничем особенным.',
      'Господин скинул с себя картуз и размотал с шеи шерстяную радужных цветов косынку. Господин оделся и поехал в общую залу для приезжающих, известно какие бывают эти общие залы — те же стены, выкрашенные масляной краской, потемневшие вверху от трубочного дыма и залоснённые снизу спинами разных проезжающих.',
      'Приезжий отобедал и, выпивши чашку кофию, уселся на диван, заложивши к себе за спину подушку, обтянутую холстиною.',
      'На другой день Чичиков посвятил утро визитам: он поехал отдавать визиты всем городским сановникам. С почтением отозвался он о губернаторе, что он, мол, душа-человек и что он, Чичиков, готов отдать ему должное внимание.',
      'Губернатор был большой добряк и даже сам вышивал иногда по тюлю. Был ни толст, ни тонок собой, имел на шее Анну.',
      'Прокурор, сурьёзный и молчаливый, с густыми бровями и несколько подмигивающим левым глазом.',
      'Полицеймейстер был некоторым образом отец и благотворитель в городе. Он был между гражданами совершенно как в родной семье, а в лавки и гостиный двор наведывался как в свою собственную кладовую.',
      'Почтмейстер, низенький человечек, но остряк и философ.',
      'Председатель был очень обходительный и приятный в обращении человек.',
      'Таким образом сделавши все нужные визиты, приезжий остался чрезвычайно доволен городом и его обитателями.'
    ]
  },
  {
    number: 2,
    title: 'Глава вторая',
    summary: 'Визит к Манилову.',
    paragraphs: [
      'Уже более двух недель приезжий жил в городе, разъезжая по вечеринкам и обедам, и, таким образом, проводя, как говорится, очень приятно время.',
      'Один Бог разве мог сказать, какой был характер Манилова. Есть род людей, известных под именем: люди так себе, ни то ни сё, ни в городе Богдан ни в селе Селифан.',
      'От него не дождёшься никакого живого или хоть даже заносчивого слова, какое можешь услышать почти от всякого, если коснёшься задирающего его предмета.',
      'В его кабинете всегда лежала какая-то книжка, заложенная закладкою на четырнадцатой странице, которую он постоянно читал уже два года.',
      'Какое бы ни было лицо у Манилова, но всё же оно было приятное, черты которого были не лишены приятности.',
      'Манилов был совершенно растроган. Оба приятеля долго жали друг другу руку и долго смотрели молча один другому в глаза, в которых видны были навернувшиеся слёзы.',
      '— Позвольте мне вам этого не позволить, — говорил Манилов с улыбкою.',
      '— А вот я вам сейчас скажу: какое бы вам хотелось иметь дело с такими мертвецами? — спросил Чичиков.',
      '— Мёртвые души? — сказал Манилов и выронил тут же чубук с трубкою на пол.'
    ]
  },
  {
    number: 3,
    title: 'Глава третья',
    summary: 'Визит к Коробочке.',
    paragraphs: [
      'Чичиков, выехавший от Манилова, сбился с дороги и оказался в поместье Коробочки.',
      '«Ну, баба, кажется, крепколобая!» — подумал про себя Чичиков.',
      '«Может быть, ты, отец мой, меня обманываешь, а они того… они больше как-нибудь стоят».',
      'Чичиков оглянулся и увидел, что на столе стояли уже грибки, пирожки, скородумки, шанишки, пряглы, блины, лепёшки со всякими припёками.',
      '«Авось-либо приедут купцы, да и прицениюсь».',
      '— Нет, я вижу, что вы точно хотите меня надуть, — сказала Коробочка. — Почём вы, батюшка, покупаете мёртвые души?',
      '— Да на что ж они вам? — вопрошала старуха, выпучив на него глаза.',
      'Коробочка, впрочем, успокоилась, заметивши, что дело, точно, было несколько необыкновенное.'
    ]
  },
  {
    number: 4,
    title: 'Глава четвёртая',
    summary: 'Визит к Ноздрёву.',
    paragraphs: [
      'Заехавши в трактир, Чичиков встретил там Ноздрёва, возвращавшегося с ярмарки.',
      'Таких людей приходилось всякому встречать немало. Они называются разбитными малыми, слывут ещё в детстве и в школе за хороших товарищей и при всём том бывают весьма больно поколачиваемы.',
      'Ноздрёв был в некотором отношении исторический человек. Ни на одном собрании, где он был, не обходилось без истории.',
      'Он предлагал вам побиться об заклад на что хотите, играл в шашки, в карты и вообще во всё, что ни попало.',
      '«Вот граница! — сказал Ноздрёв, — всё, что ни видишь по эту сторону, всё моё, и даже по ту сторону».',
      '— Да на что тебе? — спрашивал Ноздрёв. — А впрочем, я тебе их не продам. Я лучше сыграю с тобой в шашки!',
      'Ноздрёв был таков, что готов был предложить ехать куда угодно, хоть на край света, вступить в какое хотите предприятие, менять всё что ни есть на всё что хотите.',
      '— Послушай, братец, давай сыграем! Ставлю всех мёртвых, — говорил Ноздрёв.'
    ]
  },
  {
    number: 5,
    title: 'Глава пятая',
    summary: 'Визит к Собакевичу.',
    paragraphs: [
      'Чичиков отправился к Собакевичу с некоторым опасением.',
      'Когда Чичиков взглянул искоса на Собакевича, он ему на этот раз показался весьма похожим на средней величины медведя.',
      'Казалось, в этом теле совсем не было души, или она у него была, но вовсе не там, где следует, а, как у бессмертного Кощея, где-то за горами.',
      '«Мне лягушку хоть сахаром облепи, не возьму её в рот, и устрицы тоже не возьму: я знаю, на что устрица похожа».',
      '«У меня когда свинина — всю свинью давай на стол, баранина — всего барана тащи, гусь — всего гуся!»',
      '— Вам нужны мёртвые души? — спросил Собакевич очень просто, без малейшего удивления, как бы речь шла о хлебе.',
      '— По два с половиной, — сказал Собакевич. — Впрочем, чтобы вам не говорить, что я дорожусь и не хочу сделать вам никакого одолжения, — по семьдесят пять рублей за душу!',
      'Собакевич был прав: в списке, который он составил, каждый мёртвый крестьянин был расписан так подробно, что казался живым.'
    ]
  },
  {
    number: 6,
    title: 'Глава шестая',
    summary: 'Визит к Плюшкину.',
    paragraphs: [
      'Прежде, давно, в лета моей юности, в лета невозвратно мелькнувшего моего детства, мне было весело подъезжать в первый раз к незнакомому месту.',
      'Прореха на человечестве.',
      'Маленькие глазки ещё не потухнули и бегали из-под высоко выросших бровей, как мыши.',
      'И до такой ничтожности, мелочности, гадости мог снизойти человек! Мог так измениться!',
      'А ведь было время, когда он только был бережливым хозяином! Был женат и семьянин, и сосед заезжал к нему пообедать.',
      'На что уж казалось, это была не жизнь, а прозябание какого-то существа.',
      '— Вот видишь ли, какие дела, — говорил Плюшкин, — у меня, что паутина, мухи нанесли, грязь одна.',
      'И на этого-то человека нашлось подействовать! — подумал Чичиков, выехавши от Плюшкина.'
    ]
  },
  {
    number: 7,
    title: 'Глава седьмая',
    summary: 'Оформление купчих крепостей.',
    paragraphs: [
      'Счастлив путник, который после длинной, скучной дороги с её холодами, слякотью, грязью, невыспавшимися станционными смотрителями, бряканьями колокольчиков, починками, перебранками, ямщиками видит наконец знакомую крышу.',
      'Чичиков был в весьма приятном расположении духа, сидя в своей бричке, катившей давно уже по большой дороге.',
      'Председатель был очень обходительный и приятный в обращении человек.',
      '«Вы купили крестьян без земли? На вывод?» — «На вывод».',
      'Дело было обделано в один день.',
      'Чичиков был совершенно доволен. Купчие крепости были оформлены, деньги за гербовую бумагу и за прописку уплачены.',
      'Чичиков хотел было вынуть из шкатулки бумагу, но председатель сказал, что и этого не нужно, и что он всё помнит и знает.',
      'После обеда, когда все были чрезвычайно довольны, Чичиков раскланялся и уехал.'
    ]
  },
  {
    number: 8,
    title: 'Глава восьмая',
    summary: 'Бал у губернатора. Слухи о богатстве Чичикова.',
    paragraphs: [
      'Покупки Чичикова сделались предметом разговоров. В городе пошли толки, мнения, рассуждения и споры о том, выгодно ли покупать крестьян на вывод.',
      'На бале у губернатора Чичиков оказался в центре внимания. Все дамы были от него в восторге.',
      'Но посреди бала случилась неприятность: появился Ноздрёв, который во всеуслышание объявил, что Чичиков скупает мёртвые души.',
      'Дамы тут же потеряли к Чичикову всякий интерес и стали смотреть на него с подозрением.',
      'Бал, который начался так удачно для Чичикова, закончился для него полным провалом.'
    ]
  },
  {
    number: 9,
    title: 'Глава девятая',
    summary: 'Распространение слухов. Город обсуждает Чичикова.',
    paragraphs: [
      'Поутру, раньше даже того времени, которое назначено в городе NN для визитов, из дверей оранжевого деревянного дома выпорхнула дама.',
      'Две дамы, приятная и приятная во всех отношениях, обсуждают происшествие с мёртвыми душами.',
      'Вскоре весь город был взбудоражен. Все стали строить догадки о том, кто же такой Чичиков на самом деле.',
      'Кто говорил, что Чичиков — делатель фальшивых ассигнаций, кто — что он шпион, кто — что он разбойник.',
      'Город пришёл в такое волнение, какого давно уже не испытывал.'
    ]
  },
  {
    number: 10,
    title: 'Глава десятая',
    summary: 'Чиновники в панике. Версия о капитане Копейкине.',
    paragraphs: [
      'Чиновники собрались у полицеймейстера для обсуждения ситуации.',
      'Каждый предлагал свою версию о том, кто такой Чичиков.',
      '«Да это просто капитан Копейкин!» — воскликнул почтмейстер.',
      'Почтмейстер рассказал историю о капитане Копейкине — герое войны, оставшемся без руки и ноги, которого отвергло государство.',
      'Версия была отвергнута, так как у Чичикова были и руки, и ноги.',
      'Прокурор пришёл домой и умер — внезапно, без всякой причины.',
      'Только тогда с соболезнованием узнали, что у покойника была, точно, душа, хотя он по скромности своей никогда её не показывал.'
    ]
  },
  {
    number: 11,
    title: 'Глава одиннадцатая',
    summary: 'Биография Чичикова. Бегство из города.',
    paragraphs: [
      'Темно и скромно происхождение нашего героя. Родители были дворяне, но столбовые или личные — Бог ведает.',
      'Герой наш, впрочем, был не из тех людей, у которых всё дряблость, — он имел характер и волю.',
      '«Зацепи, зацепи!» — говорил отец. И с тех пор каждый раз, когда встречал нового человека, Чичиков тотчас принимался за дело.',
      'Он умел совершенно обворожить и обольстить тех, от которых зависело его будущее, умел вести себя как нельзя лучше с начальством.',
      'Чичиков решил бежать из города, не дожидаясь, пока слухи превратятся в обвинения.',
      'Бричка выехала из города. Русь! Русь! Вижу тебя, из моего чудного, прекрасного далека тебя вижу.',
      'Что ж был на самом деле прокурор? — он был, и более ничего.',
      'И какой же русский не любит быстрой езды? Его ли душе, стремящейся закружиться, загуляться, сказать иногда: «чёрт побери всё!» — его ли душе не любить её?',
      'Не так ли и ты, Русь, что бойкая необгонимая тройка несёшься? Дымом дымится под тобою дорога, гремят мосты, всё отстаёт и остаётся позади.'
    ]
  }
];

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function getCharacter(id) {
  return CHARACTERS[id] || null;
}

function getCharactersByType(type) {
  return Object.values(CHARACTERS).filter(c => c.type === type);
}

function getLandowners() {
  return getCharactersByType('landowner');
}

function getOfficials() {
  return getCharactersByType('official');
}

function getChapter(number) {
  return TEXT_CHAPTERS.find(ch => ch.number === number) || null;
}

// Нормализация для устойчивого поиска цитат:
// убираем различия ё/е, виды кавычек/тире/апострофов, лишние пробелы,
// знаки препинания — оставляем только буквы и пробелы в нижнем регистре.
function _normalizeForSearch(s) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"„“”'']/g, '')
    .replace(/[—–-]/g, ' ')
    .replace(/[.,!?;:()\[\]…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Находит диапазон исходного абзаца, соответствующий цитате.
// Подход: ищем цепочку «опорных» слов из цитаты (длиной >=5) в правильном
// порядке внутри абзаца. Возвращает {rawStart, rawEnd} или null.
function _findHighlightRange(paragraph, quote) {
  const cleanQuote = quote
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"„“”'.,!?;:()\[\]…—–-]/g, ' ');
  const words = cleanQuote.split(/\s+/).filter(w => w.length >= 5);
  if (words.length === 0) return null;

  const normChars = [];
  const origIndices = [];
  for (let i = 0; i < paragraph.length; i++) {
    let ch = paragraph[i].toLowerCase();
    if (ch === 'ё') ch = 'е';
    normChars.push(ch);
    origIndices.push(i);
  }
  const normPar = normChars.join('');

  const wordPositions = words.map(w => {
    const occ = [];
    let from = 0;
    while (true) {
      const pos = normPar.indexOf(w, from);
      if (pos < 0) break;
      occ.push({ start: pos, end: pos + w.length });
      from = pos + 1;
    }
    return occ;
  });

  let best = null;
  const tryChain = (startWordIdx, startOccIdx) => {
    const chain = [wordPositions[startWordIdx][startOccIdx]];
    let lastEnd = chain[0].end;
    let firstStart = chain[0].start;
    for (let wi = startWordIdx + 1; wi < wordPositions.length; wi++) {
      const candidates = wordPositions[wi].filter(p => p.start >= lastEnd && p.start - lastEnd < 80);
      if (candidates.length === 0) continue;
      const next = candidates[0];
      chain.push(next);
      lastEnd = next.end;
    }
    const span = lastEnd - firstStart;
    if (chain.length < 2) return null;
    if (span > quote.length * 1.5) return null;
    return { start: firstStart, end: lastEnd, count: chain.length, span };
  };

  for (let wi = 0; wi < wordPositions.length; wi++) {
    for (let oi = 0; oi < wordPositions[wi].length; oi++) {
      const res = tryChain(wi, oi);
      if (!res) continue;
      if (!best
          || res.count > best.count
          || (res.count === best.count && res.span < best.span)) {
        best = res;
      }
    }
  }

  if (!best) return null;
  return {
    rawStart: origIndices[best.start],
    rawEnd: origIndices[best.end - 1] + 1
  };
}

// Подсветка цитаты в полном абзаце (используется опционально).
function _highlightInParagraph(paragraph, quote) {
  const range = _findHighlightRange(paragraph, quote);
  if (!range) return _escapeHTML(paragraph);
  return _escapeHTML(paragraph.substring(0, range.rawStart))
    + '<mark class="quote-highlight">'
    + _escapeHTML(paragraph.substring(range.rawStart, range.rawEnd))
    + '</mark>'
    + _escapeHTML(paragraph.substring(range.rawEnd));
}

// Извлекает короткий фрагмент абзаца вокруг найденной подсветки:
// 2–3 предложения сверху + цитата + 2–3 предложения снизу.
// Обрезка по ближайшим границам предложений (. ! ? или —).
function _buildExcerptHTML(paragraph, quote, contextChars = 220) {
  const range = _findHighlightRange(paragraph, quote);
  if (!range) {
    // Цитата не найдена — обрежем абзац до 400 символов как fallback.
    const cut = Math.min(paragraph.length, 400);
    return _escapeHTML(paragraph.substring(0, cut))
      + (paragraph.length > cut ? ' <span class="excerpt-ellipsis">…</span>' : '');
  }
  const { rawStart, rawEnd } = range;

  // Цель: подобрать excerptStart и excerptEnd так, чтобы они приходились
  // на границу предложения и охватывали ~contextChars символов с каждой стороны.
  let excerptStart = Math.max(0, rawStart - contextChars);
  let excerptEnd = Math.min(paragraph.length, rawEnd + contextChars);

  // Сдвинуть excerptStart до начала предложения (после ближайшего ". " / "! " / "? ").
  if (excerptStart > 0) {
    const slice = paragraph.substring(excerptStart, rawStart);
    // Ищем последний разрыв предложения в slice — затем после него начинаем.
    const sentenceBreaks = [...slice.matchAll(/[.!?]\s+/g)];
    if (sentenceBreaks.length > 0) {
      const last = sentenceBreaks[sentenceBreaks.length - 1];
      excerptStart = excerptStart + last.index + last[0].length;
    }
  }
  // Сдвинуть excerptEnd до конца предложения (захватить ". ", "! ", "? ").
  if (excerptEnd < paragraph.length) {
    const slice = paragraph.substring(rawEnd, excerptEnd + 80);
    const m = slice.match(/[.!?](?=\s|$)/);
    if (m) {
      excerptEnd = rawEnd + m.index + 1;
    }
  }

  // Защитимся от схлопывания: если excerptStart оказался правее rawStart, откат.
  if (excerptStart > rawStart) excerptStart = Math.max(0, rawStart - 80);
  if (excerptEnd < rawEnd) excerptEnd = Math.min(paragraph.length, rawEnd + 80);

  const before = paragraph.substring(excerptStart, rawStart);
  const highlight = paragraph.substring(rawStart, rawEnd);
  const after = paragraph.substring(rawEnd, excerptEnd);

  const prefix = excerptStart > 0 ? '<span class="excerpt-ellipsis">… </span>' : '';
  const suffix = excerptEnd < paragraph.length ? '<span class="excerpt-ellipsis"> …</span>' : '';

  return prefix
    + _escapeHTML(before)
    + '<mark class="quote-highlight">' + _escapeHTML(highlight) + '</mark>'
    + _escapeHTML(after)
    + suffix;
}

// Берёт последние 1–2 предложения из абзаца (для контекста «сверху»).
function _getParagraphTail(paragraph, maxChars = 260) {
  if (!paragraph) return null;
  if (paragraph.length <= maxChars) return _escapeHTML(paragraph);
  const slice = paragraph.substring(paragraph.length - maxChars);
  // Ищем первый разрыв предложения, чтобы начать «чисто».
  const m = slice.match(/[.!?]\s+/);
  if (m) {
    const cut = paragraph.length - maxChars + m.index + m[0].length;
    return '<span class="excerpt-ellipsis">… </span>' + _escapeHTML(paragraph.substring(cut));
  }
  return '<span class="excerpt-ellipsis">… </span>' + _escapeHTML(slice);
}

// Берёт первые 1–2 предложения из абзаца (для контекста «снизу»).
function _getParagraphHead(paragraph, maxChars = 260) {
  if (!paragraph) return null;
  if (paragraph.length <= maxChars) return _escapeHTML(paragraph);
  const slice = paragraph.substring(0, maxChars);
  // Ищем последний разрыв предложения внутри slice — обрезаем по нему.
  const breaks = [...slice.matchAll(/[.!?]\s+/g)];
  if (breaks.length > 0) {
    const last = breaks[breaks.length - 1];
    const cut = last.index + last[0].length;
    return _escapeHTML(paragraph.substring(0, cut).trim()) + ' <span class="excerpt-ellipsis">…</span>';
  }
  return _escapeHTML(slice) + ' <span class="excerpt-ellipsis">…</span>';
}

function _escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findQuoteInText(quote) {
  const normQ = _normalizeForSearch(quote);
  if (normQ.length < 20) return null;

  // Этап 1: пытаемся найти максимально длинный непрерывный фрагмент цитаты
  // в каком-нибудь абзаце. Сначала ищем по префиксам, затем по любым подстрокам.
  const tryFindByPrefix = (len) => {
    const needle = normQ.substring(0, len);
    for (const chapter of TEXT_CHAPTERS) {
      for (let i = 0; i < chapter.paragraphs.length; i++) {
        const normP = _normalizeForSearch(chapter.paragraphs[i]);
        if (normP.includes(needle)) return { chapter, i };
      }
    }
    return null;
  };

  const tryFindBySubstring = (len) => {
    // перебираем все непрерывные «окна» нормализованной цитаты длиной len
    for (let start = 0; start <= normQ.length - len; start += 5) {
      const needle = normQ.substring(start, start + len);
      // пропускаем «окна», в которых много пробелов (часто шум)
      if (needle.replace(/\s/g, '').length < len * 0.7) continue;
      for (const chapter of TEXT_CHAPTERS) {
        for (let i = 0; i < chapter.paragraphs.length; i++) {
          const normP = _normalizeForSearch(chapter.paragraphs[i]);
          if (normP.includes(needle)) return { chapter, i };
        }
      }
    }
    return null;
  };

  const build = (hit) => {
    const par = hit.chapter.paragraphs[hit.i];
    const prevPar = hit.i > 0 ? hit.chapter.paragraphs[hit.i - 1] : null;
    const nextPar = hit.i < hit.chapter.paragraphs.length - 1
      ? hit.chapter.paragraphs[hit.i + 1] : null;
    return {
      chapter: hit.chapter.number,
      chapterTitle: hit.chapter.title,
      paragraphIndex: hit.i,
      paragraph: par,
      paragraphHTML: _highlightInParagraph(par, quote),
      excerptHTML: _buildExcerptHTML(par, quote),
      contextBeforeShort: _getParagraphTail(prevPar),
      contextAfterShort: _getParagraphHead(nextPar),
      context: { before: prevPar, after: nextPar }
    };
  };

  // Сперва по префиксам (быстрее и точнее).
  for (let len = Math.min(normQ.length, 80); len >= 25; len -= 5) {
    const hit = tryFindByPrefix(len);
    if (hit) return build(hit);
  }
  // Затем по любым подстрокам (для пересказов / перестановок слов).
  for (let len = Math.min(normQ.length, 50); len >= 25; len -= 5) {
    const hit = tryFindBySubstring(len);
    if (hit) return build(hit);
  }
  return null;
}

/* Stable IDs preserve existing checkpoints; new stops extend the explanation. */
const LEARNING_ORDER=[15,16,17,35,18,19,20,36,21,22,23,37,24,38,39,25,26,40,42,27,41];
const NEBULA_RETURN=43;
const LEARNING_CHAPTERS=[[16,17],[35,18],LEARNING_ORDER.slice(5)];
const LEARNING_BASE={35:17,36:20,37:23,38:24,39:24,40:24,41:26,42:27,43:15};
const learningBase=s=>LEARNING_BASE[s]??s;
const LEARNING_TITLES={35:'Как карточка узнаёт свой прогресс',36:'Подстановка в формулу забывания',37:'Почему выбран порог 90%',38:'Как растёт устойчивость памяти',39:'Как изменяется трудность',40:'Четыре оценки — четыре результата',41:'Как формируется очередь занятия',42:'Что FSRS делает после забывания'};
const learningGroup=s=>s===15||s===NEBULA_RETURN?0:Math.max(0,LEARNING_CHAPTERS.findIndex(ids=>ids.includes(s)));
const LEARNING_GROUPS=['Выбор материала','Карточка','Её история'];

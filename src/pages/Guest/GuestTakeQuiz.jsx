import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import '../../styles/Student/TakeQuiz.css'; // DnD attribute selectors only
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import MediaRenderer from '../../components/MediaRenderer';
import { FaGripLines, FaArrowLeft, FaArrowRight, FaCheckCircle } from 'react-icons/fa';

const shuffleArray = (arr) => !arr || !Array.isArray(arr) ? [] : [...arr].sort(() => Math.random() - 0.5);

const generateGuestId = () => `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const GuestTakeQuiz = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guestName, setGuestName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeSpent, setTimeSpent] = useState([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [finalResults, setFinalResults] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [direction, setDirection] = useState(0);
  const timerRef = useRef(null);
  const questionStartTimeRef = useRef(null);
  const guestIdRef = useRef(generateGuestId());

  useEffect(() => {
    const load = async () => {
      if (!quizId) { setError('No quiz ID.'); setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'quizzes', quizId));
        if (!snap.exists()) { setError('Quiz not found.'); return; }
        const data = snap.data();
        setQuiz(data);
        const init = (data.questions || []).map(q => {
          try {
            switch (q.type) {
              case 'MCQ': return [];
              case 'FILL_IN_THE_BLANK': case 'PARAGRAPH': return '';
              case 'MATCH_THE_FOLLOWING': return { pairs: {}, bank: shuffleArray((q.matchData?.pairs || []).map(p => ({ id: p.id, answerText: p.answer, answerMedia: p.answerMedia }))) };
              case 'REORDER': return shuffleArray(q.reorderData?.items || []);
              case 'CATEGORIZE': return { ...Object.fromEntries((q.categorizeData?.categories || []).map(c => [c.id, []])), bank: shuffleArray(q.categorizeData?.items || []) };
              case 'VISUAL_COMPREHENSION': case 'LISTENING_COMPREHENSION': { const sqs = q.visualData?.subQuestions || q.listeningData?.subQuestions || []; const sa = {}; sqs.forEach((sq, i) => { sa[i] = sq.type === 'MCQ' ? [] : ''; }); return sa; }
              default: return null;
            }
          } catch { return null; }
        });
        setAnswers(init);
        setTimeSpent(new Array((data.questions || []).length).fill(0));
      } catch { setError('Failed to load quiz.'); }
      finally { setLoading(false); }
    };
    load();
  }, [quizId]);

  useEffect(() => {
    if (!nameSubmitted || quizSubmitted || !quiz || currentQuestionIndex >= quiz.questions.length) return;
    const tl = parseInt(quiz.questions[currentQuestionIndex].timeLimit, 10) || 60;
    questionStartTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(tl);
    timerRef.current = setInterval(() => setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); handleNext(true); return 0; } return t - 1; }), 1000);
    return () => clearInterval(timerRef.current);
  }, [currentQuestionIndex, nameSubmitted, quizSubmitted, quiz]);

  const recordTime = () => {
    const spent = questionStartTimeRef.current ? (Date.now() - questionStartTimeRef.current) / 1000 : 0;
    setTimeSpent(ts => { const n = [...ts]; n[currentQuestionIndex] = spent; return n; });
  };

  const handleAnswerChange = (value, subIndex = null) => {
    setAnswers(prev => {
      const na = JSON.parse(JSON.stringify(prev));
      const q = quiz.questions[currentQuestionIndex];
      if (q.type.includes('COMPREHENSION')) {
        const key = q.visualData ? 'visualData' : 'listeningData';
        if (q[key].subQuestions[subIndex].type === 'MCQ') {
          const cur = na[currentQuestionIndex][subIndex] || [];
          na[currentQuestionIndex][subIndex] = cur.includes(value) ? cur.filter(id => id !== value) : [...cur, value];
        } else { na[currentQuestionIndex][subIndex] = value; }
      } else if (q.type === 'MCQ') {
        const cur = na[currentQuestionIndex] || [];
        na[currentQuestionIndex] = cur.includes(value) ? cur.filter(id => id !== value) : [...cur, value];
      } else { na[currentQuestionIndex] = value; }
      return na;
    });
  };

  const handleDragEnd = ({ source: src, destination: dest }) => {
    if (!dest) return;
    const q = quiz.questions[currentQuestionIndex];
    setAnswers(cur => {
      const na = JSON.parse(JSON.stringify(cur));
      let a = na[currentQuestionIndex];
      if (q.type === 'REORDER') { const items = Array.from(a); const [r] = items.splice(src.index, 1); items.splice(dest.index, 0, r); na[currentQuestionIndex] = items; }
      if (q.type === 'CATEGORIZE') {
        const sc = Array.from(a[src.droppableId]); const [mv] = sc.splice(src.index, 1);
        if (src.droppableId === dest.droppableId) { sc.splice(dest.index, 0, mv); a[src.droppableId] = sc; }
        else { const dc = Array.from(a[dest.droppableId] || []); dc.splice(dest.index, 0, mv); a[src.droppableId] = sc; a[dest.droppableId] = dc; }
        na[currentQuestionIndex] = a;
      }
      if (q.type === 'MATCH_THE_FOLLOWING') {
        let dragged;
        if (src.droppableId === 'bank') { dragged = a.bank[src.index]; a.bank.splice(src.index, 1); }
        else { dragged = a.pairs[src.droppableId]; delete a.pairs[src.droppableId]; }
        if (dest.droppableId === 'bank') { a.bank.splice(dest.index, 0, dragged); }
        else { const d = a.pairs[dest.droppableId]; if (d) a.bank.push(d); a.pairs[dest.droppableId] = dragged; }
        na[currentQuestionIndex] = a;
      }
      return na;
    });
  };

  const handleNext = (isTimeout = false) => {
    if (!isTimeout) recordTime();
    setDirection(1);
    if (currentQuestionIndex < quiz.questions.length - 1) setCurrentQuestionIndex(i => i + 1);
    else handleSubmit();
  };
  const handlePrev = () => { recordTime(); setDirection(-1); if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1); };

  const handleSubmit = async () => {
    if (quizSubmitted) return;
    recordTime(); setQuizSubmitted(true); clearInterval(timerRef.current);
    try {
      let total = 0, bonus = 0, needsManual = false;
      const detailed = quiz.questions.map((q, i) => {
        const ua = answers[i];
        let pts = 0, status = 'auto_graded', correct = false;
        switch (q.type) {
          case 'MCQ': { const ci = q.mcqData.correctOptions.map(String); const si = (ua || []).map(String); if (ci.length && ci.length === si.length && ci.every(id => si.includes(id))) { pts = q.points; correct = true; } break; }
          case 'FILL_IN_THE_BLANK': { if (q.fillBlankData.answers.map(a => a.text.toLowerCase()).includes((ua || '').trim().toLowerCase())) { pts = q.points; correct = true; } break; }
          case 'PARAGRAPH': { needsManual = true; status = 'pending_review'; break; }
          case 'MATCH_THE_FOLLOWING': { if (q.matchData?.pairs) { let m = 0; q.matchData.pairs.forEach(p => { if (ua?.pairs?.[p.id]?.answerText === p.answer) m++; }); pts = q.matchData.pairs.length > 0 ? Math.round((m / q.matchData.pairs.length) * q.points) : 0; if (m === q.matchData.pairs.length) correct = true; } break; }
          case 'CATEGORIZE': { if (q.categorizeData?.items) { let m = 0; q.categorizeData.items.forEach(item => { const sc = Object.keys(ua || {}).find(cid => cid !== 'bank' && ua[cid].some(x => x.id === item.id)); if (String(sc) === String(item.categoryId)) m++; }); pts = q.categorizeData.items.length > 0 ? Math.round((m / q.categorizeData.items.length) * q.points) : 0; if (m === q.categorizeData.items.length) correct = true; } break; }
          case 'REORDER': { if (ua?.every((it, idx) => it.id === q.reorderData.items[idx].id)) { pts = q.points; correct = true; } break; }
        }
        total += pts;
        if (correct) { const tt = timeSpent[i] || q.timeLimit; const tl = parseInt(q.timeLimit, 10); if (tt < tl) bonus += Math.ceil((q.points * 0.2) * (1 - tt / tl)); }
        return { type: q.type, questionText: q.questionText, userAnswer: JSON.parse(JSON.stringify(ua)), pointsAwarded: pts, status, isCorrect: correct };
      });
      const res = {
        quizId, userId: guestIdRef.current, username: guestName.trim() || 'Guest',
        quizTitle: quiz.title, status: needsManual ? 'pending' : 'completed',
        score: total, bonus, finalScore: total + bonus, maxScore: quiz.totalPoints,
        completedAt: serverTimestamp(), answers: detailed, teacherId: quiz.createdBy,
        isGuest: true,
      };
      const ref = await addDoc(collection(db, 'quiz_results'), res);
      setFinalResults({ id: ref.id, ...res });
    } catch (err) {
      console.error('Submit error:', err);
      setError('Failed to submit. Please try again.');
      setQuizSubmitted(false);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] flex flex-col items-center justify-center gap-4 text-white">
      <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-lg font-semibold">Loading quiz...</p>
    </div>
  );
  if (error) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] flex flex-col items-center justify-center gap-6 text-white p-8">
      <div className="text-5xl">😞</div>
      <h2 className="text-2xl font-bold">{error}</h2>
      <button onClick={() => navigate('/')} className="px-6 py-3 bg-white/20 rounded-xl font-semibold hover:bg-white/30 transition-all">
        Back to Home
      </button>
    </div>
  );

  // ── Name / intro screen ─────────────────────────────────────────────────
  if (!nameSubmitted) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] flex items-center justify-center p-4 text-white">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="bg-white text-[#333] rounded-3xl p-10 w-full max-w-md shadow-2xl text-center">
        <div className="text-5xl mb-4">🎮</div>
        <h1 className="text-3xl font-black mb-2">{quiz.title}</h1>
        {quiz.description && <p className="text-gray-500 text-sm mb-6 leading-relaxed">{quiz.description}</p>}

        <div className="flex justify-center gap-8 bg-gray-50 rounded-2xl p-4 mb-8 text-sm">
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-black text-[#6c63ff]">{quiz.questions?.length ?? 0}</span>
            <span className="text-gray-400">Questions</span>
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-black text-[#6c63ff]">{quiz.totalPoints}</span>
            <span className="text-gray-400">Points</span>
          </div>
        </div>

        <input
          type="text"
          placeholder="Your name (optional)"
          value={guestName}
          onChange={e => setGuestName(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && setNameSubmitted(true)}
          maxLength={30}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-base outline-none focus:border-[#6c63ff] mb-4 transition-all"
        />

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setNameSubmitted(true)}
          className="w-full py-4 bg-gradient-to-r from-[#4776e6] to-[#8e54e9] text-white font-black text-lg rounded-2xl shadow-[0_6px_20px_rgba(107,99,255,0.4)] hover:shadow-[0_8px_28px_rgba(107,99,255,0.5)] transition-all"
        >
          Let's Go! 🚀
        </motion.button>

        <p className="text-gray-400 text-xs mt-4">Playing as guest · Results visible to teacher</p>
      </motion.div>
    </div>
  );

  // ── Completed screen ────────────────────────────────────────────────────
  if (quizSubmitted) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] flex items-center justify-center p-4">
      {finalResults ? (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white text-[#333] rounded-3xl p-10 w-full max-w-md shadow-2xl text-center">
          <FaCheckCircle className="text-5xl text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-black mb-1">Quiz Completed!</h1>
          <p className="text-gray-400 mb-8">
            {guestName ? `Great job, ${guestName}!` : 'Great job!'}
          </p>

          <div className="w-40 h-40 mx-auto rounded-full bg-gradient-to-br from-[#6c63ff] to-[#4854c7] text-white flex flex-col justify-center items-center shadow-[0_10px_30px_rgba(108,99,255,0.4)] mb-6">
            <span className="text-sm font-medium opacity-70">Final Score</span>
            <span className="text-5xl font-black leading-tight">{finalResults.finalScore}</span>
            <span className="text-xs opacity-60">/ {finalResults.maxScore}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-8 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="font-black text-xl text-[#6c63ff]">{finalResults.score}</div>
              <div className="text-gray-400">Base score</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3">
              <div className="font-black text-xl text-green-500">+{finalResults.bonus}</div>
              <div className="text-gray-400">Speed bonus</div>
            </div>
          </div>

          {finalResults.status === 'pending' && (
            <p className="text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm mb-6">
              ⏳ Some answers need manual review by your teacher.
            </p>
          )}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/')}
            className="w-full py-3 bg-gradient-to-r from-[#4776e6] to-[#8e54e9] text-white font-bold rounded-xl transition-all hover:shadow-[0_6px_20px_rgba(107,99,255,0.4)]"
          >
            Back to Home
          </motion.button>
        </motion.div>
      ) : (
        <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-2xl flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#6c63ff]/30 border-t-[#6c63ff] rounded-full animate-spin" />
          <p className="text-gray-500 font-semibold">Submitting your answers...</p>
        </div>
      )}
    </div>
  );

  // ── Active quiz ─────────────────────────────────────────────────────────
  const currentQ = quiz.questions[currentQuestionIndex];
  const currentA = answers[currentQuestionIndex];
  const mainMedia = currentQ.visualData?.mainMedia || currentQ.listeningData?.mainMedia || currentQ.media;
  const variants = { enter: d => ({ x: d > 0 ? 300 : -300, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: d => ({ x: d < 0 ? 300 : -300, opacity: 0 }) };

  const optBase = 'flex items-center gap-4 border-2 border-[#ddd] rounded-xl p-4 cursor-pointer transition-all hover:border-[#8e2de2] hover:translate-x-1 text-[#333]';
  const optSel = 'bg-[#ede7f6] border-[#4a00e0] text-[#4a00e0] font-semibold shadow-md';
  const draggable = 'px-4 py-2.5 rounded-full font-medium cursor-grab text-center shadow text-white bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center gap-2 text-sm';
  const matched = 'px-4 py-2.5 rounded-full font-medium cursor-default text-center shadow text-white bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center gap-2 text-sm';

  // Timer color
  const timerColor = timeLeft <= 10 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/20';

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] text-white p-4 flex flex-col items-center">

        {/* Header */}
        <div className="flex justify-between items-center w-full max-w-[800px] mt-4 mb-3 px-1">
          <div className="flex flex-col">
            <span className="text-sm font-semibold opacity-70">{quiz.title}</span>
            {guestName && <span className="text-xs opacity-40">Playing as {guestName}</span>}
          </div>
          <motion.div
            animate={timeLeft <= 10 ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: timeLeft <= 10 ? Infinity : 0, duration: 0.8 }}
            className={`font-black text-lg px-4 py-1.5 rounded-full border ${timerColor} transition-colors`}
          >
            {timeLeft}s
          </motion.div>
        </div>

        {/* Progress */}
        <div className="w-full max-w-[800px] mb-5">
          <div className="flex justify-between text-xs text-white/50 mb-1.5">
            <span>Question {currentQuestionIndex + 1} of {quiz.questions.length}</span>
            <span>{Math.round(((currentQuestionIndex + 1) / quiz.questions.length) * 100)}%</span>
          </div>
          <div className="bg-white/20 h-2 rounded-full overflow-hidden">
            <motion.div
              className="bg-white h-full rounded-full"
              animate={{ width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          {/* Question dots */}
          <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
            {quiz.questions.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                  i === currentQuestionIndex ? 'bg-white scale-125 shadow-[0_0_8px_white]' :
                  answers[i] && JSON.stringify(answers[i]) !== JSON.stringify(i === 0 ? [] : '') ? 'bg-green-400' :
                  'bg-white/30'
                }`}
                onClick={() => { recordTime(); setDirection(i > currentQuestionIndex ? 1 : -1); setCurrentQuestionIndex(i); }}
              />
            ))}
          </div>
        </div>

        {/* Question card */}
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentQ.id || currentQuestionIndex}
            custom={direction}
            variants={variants}
            initial="enter" animate="center" exit="exit"
            transition={{ type: 'tween', ease: 'circOut', duration: 0.4 }}
            className="bg-white text-[#333] p-6 md:p-8 rounded-2xl max-w-[800px] w-full shadow-2xl mb-5"
          >
            {mainMedia && <MediaRenderer media={mainMedia} transform="question_main" className="block max-w-full max-h-[350px] mx-auto mb-5 rounded-xl" />}
            <h2 className="text-xl md:text-2xl font-bold mb-6 leading-relaxed text-[#1e293b]">{currentQ.questionText}</h2>

            <div>
              {/* MCQ */}
              {currentQ.type === 'MCQ' && (
                <div className="grid gap-3">
                  {currentQ.mcqData.options.map(opt => (
                    <motion.div key={opt.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      className={`${optBase} ${currentA?.includes(opt.id) ? optSel : ''}`}
                      onClick={() => handleAnswerChange(opt.id)}>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm flex-shrink-0 transition-all ${currentA?.includes(opt.id) ? 'bg-[#4a00e0] border-[#4a00e0] text-white' : 'border-[#ccc]'}`}>
                        {currentA?.includes(opt.id) && '✓'}
                      </div>
                      {opt.text && <span>{opt.text}</span>}
                      <MediaRenderer media={opt.media} transform="thumbnail" />
                    </motion.div>
                  ))}
                </div>
              )}

              {currentQ.type === 'FILL_IN_THE_BLANK' && (
                <input type="text" value={currentA || ''} onChange={e => handleAnswerChange(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-[#ddd] focus:border-[#4a00e0] focus:shadow-[0_0_0_3px_rgba(74,0,224,0.1)] outline-none text-lg transition-all" />
              )}

              {currentQ.type === 'PARAGRAPH' && (
                <textarea value={currentA || ''} onChange={e => handleAnswerChange(e.target.value)}
                  className="w-full p-4 rounded-xl border-2 border-[#ddd] focus:border-[#4a00e0] focus:shadow-[0_0_0_3px_rgba(74,0,224,0.1)] outline-none text-lg transition-all resize-y min-h-[120px]" />
              )}

              {currentQ.type === 'MATCH_THE_FOLLOWING' && currentA && (
                <div className="grid grid-cols-[1.2fr_1fr] gap-6 items-start">
                  <div className="flex flex-col gap-3">
                    {currentQ.matchData.pairs.map(pair => (
                      <div key={pair.id} className="grid grid-cols-[1fr_auto] items-center gap-3 bg-gray-50 rounded-xl p-2 border border-gray-200">
                        <div className="flex items-center gap-2 justify-end text-right text-[#475569] font-semibold text-sm pr-2">
                          <MediaRenderer media={pair.promptMedia} transform="thumbnail" />{pair.prompt}
                        </div>
                        <Droppable droppableId={String(pair.id)}>{provided => (
                          <div ref={provided.innerRef} {...provided.droppableProps}
                            className={`border-2 border-dashed rounded-lg min-h-[52px] flex items-center justify-center transition-colors ${currentA.pairs[pair.id] ? 'bg-purple-50 border-[#4a00e0]' : 'bg-white border-gray-300'}`}>
                            {currentA.pairs[pair.id]
                              ? <Draggable draggableId={String(currentA.pairs[pair.id].id)} index={0}>{p => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={matched}><MediaRenderer media={currentA.pairs[pair.id].answerMedia} transform="thumbnail" /><span>{currentA.pairs[pair.id].answerText}</span></div>}</Draggable>
                              : <span className="text-xs text-gray-400 italic">Drop here</span>}
                            {provided.placeholder}
                          </div>
                        )}</Droppable>
                      </div>
                    ))}
                  </div>
                  <Droppable droppableId="bank">{provided => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="bg-gray-100 p-3 rounded-xl min-h-[180px] flex flex-col gap-3">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide text-center mb-1">Answers</h4>
                      {currentA.bank.map((ans, i) => <Draggable key={ans.id} draggableId={String(ans.id)} index={i}>{p => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={draggable}><MediaRenderer media={ans.answerMedia} transform="thumbnail" /><span>{ans.answerText}</span></div>}</Draggable>)}
                      {provided.placeholder}
                    </div>
                  )}</Droppable>
                </div>
              )}

              {currentQ.type === 'REORDER' && currentA && (
                <Droppable droppableId="reorder-list">{provided => (
                  <motion.div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-3 bg-gray-50 p-4 rounded-xl border-2 border-dashed border-gray-300">
                    {currentA.map((item, i) => <Draggable key={item.id} draggableId={String(item.id)} index={i}>{p => (
                      <motion.div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} layout
                        className="p-4 bg-white border-l-4 border-[#6366f1] rounded-lg text-[#2c3e50] shadow-sm font-medium cursor-grab flex items-center gap-3">
                        <FaGripLines className="text-gray-400 flex-shrink-0" />
                        <MediaRenderer media={item.media} transform="thumbnail" className="w-10 h-8 rounded object-cover flex-shrink-0" />
                        <span>{item.text}</span>
                      </motion.div>
                    )}</Draggable>)}
                    {provided.placeholder}
                  </motion.div>
                )}</Droppable>
              )}

              {currentQ.type === 'CATEGORIZE' && currentA && (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
                    {currentQ.categorizeData.categories.map(cat => (
                      <Droppable key={cat.id} droppableId={String(cat.id)}>{provided => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="bg-gradient-to-t from-purple-50 to-white rounded-xl p-3 border border-purple-200">
                          <h3 className="text-center text-[#6d28d9] font-bold text-sm pb-2 border-b border-purple-200 mb-2">{cat.name}</h3>
                          <div className="min-h-[120px] flex flex-col gap-2">
                            {currentA[cat.id]?.map((item, i) => <Draggable key={item.id} draggableId={String(item.id)} index={i}>{p => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="p-2 bg-white border border-gray-200 rounded-lg text-sm cursor-grab font-medium flex items-center gap-2"><MediaRenderer media={item.media} transform="thumbnail" />{item.text}</div>}</Draggable>)}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}</Droppable>
                    ))}
                  </div>
                  <Droppable droppableId="bank" direction="horizontal">{provided => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="bg-gray-100 p-3 rounded-xl flex flex-wrap gap-2 min-h-[56px] border-2 border-dashed border-gray-300">
                      <p className="w-full text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Items to Sort</p>
                      {currentA.bank?.map((item, i) => <Draggable key={item.id} draggableId={String(item.id)} index={i}>{p => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="px-3 py-1.5 bg-indigo-100 border border-indigo-300 rounded-lg text-sm text-indigo-700 cursor-grab font-medium flex items-center gap-1.5"><MediaRenderer media={item.media} transform="thumbnail" />{item.text}</div>}</Draggable>)}
                      {provided.placeholder}
                    </div>
                  )}</Droppable>
                </div>
              )}

              {(currentQ.type === 'VISUAL_COMPREHENSION' || currentQ.type === 'LISTENING_COMPREHENSION') && (
                <div className="flex flex-col gap-6">
                  {(currentQ.visualData?.subQuestions || currentQ.listeningData?.subQuestions).map((subQ, si) => (
                    <div key={subQ.id} className="border-t border-gray-200 pt-5">
                      <p className="font-semibold mb-3 text-[#1e293b]">{si + 1}. {subQ.questionText}</p>
                      {subQ.type === 'MCQ' && (
                        <div className="grid gap-2">
                          {subQ.mcqData.options.map(opt => (
                            <div key={opt.id} className={`flex items-center gap-3 border-2 p-3 rounded-xl cursor-pointer transition-all text-sm ${currentA[si]?.includes(opt.id) ? 'bg-purple-50 border-[#4a00e0] text-[#4a00e0]' : 'border-gray-200 hover:border-[#8e2de2]'}`} onClick={() => handleAnswerChange(opt.id, si)}>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0 ${currentA[si]?.includes(opt.id) ? 'bg-[#4a00e0] border-[#4a00e0] text-white' : 'border-gray-300'}`}>{String.fromCharCode(65 + subQ.mcqData.options.indexOf(opt))}</div>
                              <span>{opt.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between w-full max-w-[800px] pb-8">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handlePrev} disabled={currentQuestionIndex === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            <FaArrowLeft /> Prev
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleNext(false)}
            className="flex items-center gap-2 px-8 py-3 rounded-xl font-black bg-white text-[#4854c7] shadow-lg hover:bg-white/90 hover:-translate-y-0.5 transition-all">
            {currentQuestionIndex < quiz.questions.length - 1 ? <><span>Next</span> <FaArrowRight /></> : <span>Submit Quiz 🏁</span>}
          </motion.button>
        </div>
      </div>
    </DragDropContext>
  );
};

export default GuestTakeQuiz;

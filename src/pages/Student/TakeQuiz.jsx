import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import '../../styles/Student/TakeQuiz.css'; // DnD attribute selectors only
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import MediaRenderer from '../../components/MediaRenderer';
import { FaGripLines, FaArrowLeft, FaArrowRight, FaCheckCircle, FaClipboardList } from 'react-icons/fa';

const shuffleArray = (arr) => !arr || !Array.isArray(arr) ? [] : [...arr].sort(() => Math.random() - 0.5);

const TakeQuiz = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const auth = getAuth();
  const user = auth.currentUser;

  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeSpent, setTimeSpent] = useState([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [finalResults, setFinalResults] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [direction, setDirection] = useState(0);
  const timerRef = useRef(null);
  const questionStartTimeRef = useRef(null);

  useEffect(() => {
    const fetchQuizAndInit = async () => {
      if (!quizId) { setError('No Quiz ID provided.'); setLoading(false); return; }
      setLoading(true);
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
              case 'VISUAL_COMPREHENSION': case 'LISTENING_COMPREHENSION': {
                const sqs = q.visualData?.subQuestions || q.listeningData?.subQuestions || [];
                const sa = {}; sqs.forEach((sq, i) => { sa[i] = sq.type === 'MCQ' ? [] : ''; }); return sa;
              }
              default: return null;
            }
          } catch { return null; }
        });
        setAnswers(init);
        setTimeSpent(new Array((data.questions || []).length).fill(0));
      } catch (err) { setError('Failed to load quiz.'); console.error(err); }
      finally { setLoading(false); }
    };
    fetchQuizAndInit();
  }, [quizId]);

  useEffect(() => {
    if (!quizStarted || quizSubmitted || !quiz || currentQuestionIndex >= quiz.questions.length) return;
    const tl = parseInt(quiz.questions[currentQuestionIndex].timeLimit, 10) || 60;
    questionStartTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(tl);
    timerRef.current = setInterval(() => setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); handleNextQuestion(true); return 0; } return t - 1; }), 1000);
    return () => clearInterval(timerRef.current);
  }, [currentQuestionIndex, quizStarted, quizSubmitted, quiz]);

  const recordTimeSpent = () => {
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

  const handleDragEnd = (result) => {
    const { source: src, destination: dest } = result;
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
        else { const displaced = a.pairs[dest.droppableId]; if (displaced) a.bank.push(displaced); a.pairs[dest.droppableId] = dragged; }
        na[currentQuestionIndex] = a;
      }
      return na;
    });
  };

  const handleNextQuestion = (isTimeOut = false) => {
    if (!isTimeOut) recordTimeSpent();
    setDirection(1);
    if (currentQuestionIndex < quiz.questions.length - 1) setCurrentQuestionIndex(i => i + 1);
    else handleSubmitQuiz();
  };

  const handlePreviousQuestion = () => { recordTimeSpent(); setDirection(-1); if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1); };

  const handleSubmitQuiz = async () => {
    if (quizSubmitted || !user) return;
    recordTimeSpent(); setQuizSubmitted(true); clearInterval(timerRef.current); setError('');
    try {
      let total = 0, bonus = 0, needsManual = false;
      const detailed = quiz.questions.map((q, i) => {
        const ua = answers[i];
        let pts = 0, status = 'auto_graded', correct = false;
        switch (q.type) {
          case 'MCQ': { const ci = q.mcqData.correctOptions.map(String); const si = (ua || []).map(String); if (ci.length && ci.length === si.length && ci.every(id => si.includes(id))) { pts = q.points; correct = true; } break; }
          case 'FILL_IN_THE_BLANK': { if (q.fillBlankData.answers.map(a => a.text.toLowerCase()).includes((ua || '').trim().toLowerCase())) { pts = q.points; correct = true; } break; }
          case 'PARAGRAPH': { needsManual = true; status = 'pending_review'; break; }
          case 'MATCH_THE_FOLLOWING': { if (q.matchData?.pairs) { let m = 0; q.matchData.pairs.forEach(p => { const d = ua?.pairs?.[p.id]; if (d?.answerText === p.answer) m++; }); pts = q.matchData.pairs.length > 0 ? Math.round((m / q.matchData.pairs.length) * q.points) : 0; if (q.matchData.pairs.length && m === q.matchData.pairs.length) correct = true; } break; }
          case 'CATEGORIZE': { if (q.categorizeData?.items) { let m = 0; q.categorizeData.items.forEach(item => { const sc = Object.keys(ua || {}).find(cid => cid !== 'bank' && ua[cid].some(x => x.id === item.id)); if (String(sc) === String(item.categoryId)) m++; }); pts = q.categorizeData.items.length > 0 ? Math.round((m / q.categorizeData.items.length) * q.points) : 0; if (q.categorizeData.items.length && m === q.categorizeData.items.length) correct = true; } break; }
          case 'REORDER': { const ok = ua && q.reorderData?.items ? ua.every((it, idx) => it.id === q.reorderData.items[idx].id) : false; if (ok) { pts = q.points; correct = true; } break; }
          case 'VISUAL_COMPREHENSION': case 'LISTENING_COMPREHENSION': { const sqs = q.visualData?.subQuestions || q.listeningData?.subQuestions; let sp = 0; if (sqs) { sqs.forEach((sq, si) => { if (sq.type === 'MCQ') { const ci = sq.mcqData.correctOptions.map(String); const sl = (ua[si] || []).map(String); if (ci.length && ci.length === sl.length && ci.every(id => sl.includes(id))) sp += sq.points || 5; } }); pts = sp; if (sp === q.points) correct = true; } break; }
        }
        total += pts;
        if (correct) { const tt = timeSpent[i] || q.timeLimit; const tl = parseInt(q.timeLimit, 10); if (tt < tl) bonus += Math.ceil((q.points * 0.2) * (1 - tt / tl)); }
        return { type: q.type, questionText: q.questionText, userAnswer: JSON.parse(JSON.stringify(ua)), pointsAwarded: pts, status, isCorrect: correct };
      });
      const final = total + bonus;
      const res = { quizId, userId: user.uid, quizTitle: quiz.title, status: needsManual ? 'pending' : 'completed', score: total, bonus, finalScore: final, maxScore: quiz.totalPoints, completedAt: serverTimestamp(), answers: detailed, teacherId: quiz.createdBy };
      const ref = await addDoc(collection(db, 'quiz_results'), res);
      setFinalResults({ id: ref.id, ...res });
    } catch (err) { console.error('CRITICAL ERROR:', err); setError('A critical error occurred while submitting your quiz.'); setQuizSubmitted(false); }
  };

  // --- Loading / Error ---
  if (loading) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] text-white flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"/>
      <p>Loading quiz...</p>
    </div>
  );
  if (error && !quizSubmitted) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] text-white flex items-center justify-center p-8">
      <p className="text-xl bg-white/10 rounded-xl px-8 py-6">{error}</p>
    </div>
  );

  // --- Intro screen ---
  if (!quizStarted) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] text-white flex items-center justify-center p-4">
      <div className="bg-white text-[#333] p-10 rounded-2xl w-full max-w-[550px] text-center shadow-[0_15px_40px_rgba(0,0,0,0.12)] animate-fade-in">
        <h1 className="text-[2.2rem] text-[#2c3e50] mb-2 font-bold">{quiz.title}</h1>
        <p className="text-[1.1rem] text-[#555] mb-8 leading-relaxed">{quiz.description}</p>
        <div className="flex justify-around items-center bg-[#f7f9fc] rounded-lg p-4 mb-10 text-left border border-[#e1e5ea]">
          <div className="flex flex-col"><span className="text-sm text-[#7f8c8d]">Questions:</span><strong className="text-xl text-[#34495e]">{quiz.questions?.length ?? 0}</strong></div>
          <div className="flex flex-col"><span className="text-sm text-[#7f8c8d]">Total Points:</span><strong className="text-xl text-[#34495e]">{quiz.totalPoints}</strong></div>
        </div>
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setQuizStarted(true)} className="w-full py-4 border-none font-bold text-xl rounded-lg cursor-pointer bg-gradient-to-r from-[#4776e6] to-[#8e54e9] text-white shadow-[0_4px_15px_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(71,118,230,0.4)]">
          Start Quiz
        </motion.button>
      </div>
    </div>
  );

  // --- Completed screen ---
  if (quizSubmitted) return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] text-white flex items-center justify-center p-4">
      {finalResults ? (
        <div className="bg-white text-[#333] p-10 rounded-2xl w-full max-w-[550px] text-center shadow-[0_15px_40px_rgba(0,0,0,0.12)] animate-fade-in">
          <h1 className="flex items-center justify-center gap-3 text-[2.2rem] text-[#1f2937] font-bold m-0"><FaCheckCircle className="text-[#22c55e] text-[2.5rem]"/> Quiz Completed!</h1>
          <p className="text-lg text-[#6b7280] mt-2 mb-8">Great work!</p>
          <div>
            <h2 className="text-2xl text-[#1f2937] font-semibold mb-4">Your Results</h2>
            <div className="my-6 p-4 bg-[#f9fafb] rounded-xl text-lg flex justify-center gap-8 text-[#4b5563]">
              <div>Base Score: <span className="font-semibold text-[#1f2937]">{finalResults.score} / {finalResults.maxScore}</span></div>
              <div>Speed Bonus: <span className="font-bold text-[#16a34a]">+{finalResults.bonus}</span></div>
            </div>
            <div className="w-[180px] h-[180px] mx-auto rounded-full bg-gradient-to-br from-[#6c63ff] to-[#4854c7] text-white flex flex-col justify-center items-center shadow-[0_10px_25px_rgba(108,99,255,0.3)] my-8">
              <span className="text-base font-medium opacity-80 -mb-1">Final Score</span>
              <span className="text-[4.5rem] font-bold leading-tight">{finalResults.finalScore}</span>
            </div>
            {finalResults.status === 'pending' && <p className="mt-6 text-base text-[#b91c1c] bg-[#fee2e2] p-4 rounded-lg border border-[#fecaca]">Some questions require manual grading by your teacher.</p>}
          </div>
          <div className="mt-8 flex gap-4 justify-center">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/student/dashboard')} className="px-8 py-3 border-none font-semibold text-base rounded-xl cursor-pointer bg-gradient-to-r from-[#6c63ff] to-[#4854c7] text-white shadow-[0_4px_15px_rgba(0,0,0,0.1)] hover:shadow-[0_7px_20px_rgba(108,99,255,0.25)]">
              Back to Dashboard
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/student/results')} className="flex items-center gap-2 px-8 py-3 border-2 border-[#6c63ff] text-[#6c63ff] bg-white font-semibold text-base rounded-xl cursor-pointer hover:bg-[#f5f3ff]">
              <FaClipboardList /> View Review
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="bg-white text-[#333] p-10 rounded-2xl w-full max-w-[550px] text-center shadow-[0_15px_40px_rgba(0,0,0,0.12)] flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#e0e0e0] border-t-[#6c63ff] rounded-full animate-spin"/>
          <h2 className="text-xl font-semibold">Submitting your answers...</h2>
        </div>
      )}
    </div>
  );

  // --- Active quiz ---
  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentAnswer = answers[currentQuestionIndex];
  const mainMedia = currentQuestion.visualData?.mainMedia || currentQuestion.listeningData?.mainMedia || currentQuestion.media;
  const variants = { enter: (d) => ({ x: d > 0 ? 300 : -300, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d) => ({ x: d < 0 ? 300 : -300, opacity: 0 }) };

  // Shared class strings
  const optionBase = 'flex items-center gap-4 border-2 border-[#ddd] rounded-lg p-4 cursor-pointer transition-all text-[1.1rem] text-[#333] hover:border-[#8e2de2] hover:translate-x-1.5';
  const optionSelected = 'bg-[#ede7f6] border-[#4a00e0] text-[#4a00e0] font-semibold shadow-[0_4px_10px_rgba(74,0,224,0.1)]';
  const draggableOption = 'px-5 py-3 rounded-full font-medium cursor-grab text-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] text-white bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center gap-2';
  const draggableMatched = 'px-5 py-3 rounded-full font-medium cursor-default text-center shadow-[0_2px_4px_rgba(0,0,0,0.1)] text-white bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center gap-2';

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen w-screen bg-gradient-to-br from-[#4854c7] to-[#6c63ff] text-white p-4 flex flex-col items-center justify-center">

        {/* Header */}
        <div className="flex justify-between items-center w-full max-w-[800px] mb-4 px-4">
          <h1 className="text-2xl font-bold m-0">{quiz.title}</h1>
          <div className="font-bold text-sm bg-white/10 px-4 py-2 rounded-full">{timeLeft}s</div>
        </div>

        {/* Progress */}
        <div className="w-full max-w-[800px] mb-6">
          <div className="bg-white/20 h-2 rounded overflow-hidden mb-1.5">
            <div className="bg-white h-full transition-[width] duration-300 rounded" style={{ width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}/>
          </div>
          <div className="text-sm text-right opacity-80">Question {currentQuestionIndex + 1} of {quiz.questions.length}</div>
        </div>

        {/* Question card */}
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div className="bg-white text-[#333] p-8 rounded-xl max-w-[800px] w-full shadow-[0_10px_30px_rgba(0,0,0,0.15)] mb-6" key={currentQuestion.id} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ type: 'tween', ease: 'circOut', duration: 0.5 }}>
            {mainMedia && <MediaRenderer media={mainMedia} transform="question_main" className="block max-w-full max-h-[400px] mx-auto mb-6 rounded-lg"/>}
            <h2 className="text-2xl font-semibold mb-8 leading-relaxed text-[#2c3e50]">{currentQuestion.questionText}</h2>

            <div className="mt-4">
              {/* MCQ */}
              {currentQuestion.type === 'MCQ' && (
                <div className="grid gap-3">
                  {currentQuestion.mcqData.options.map(opt => (
                    <motion.div key={opt.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className={`${optionBase} ${currentAnswer?.includes(opt.id) ? optionSelected : ''}`} onClick={() => handleAnswerChange(opt.id)}>
                      <div className={`flex items-center justify-center h-7 w-7 flex-shrink-0 border-2 rounded-full font-semibold transition-all ${currentAnswer?.includes(opt.id) ? 'bg-[#4a00e0] text-white border-[#4a00e0]' : 'border-[#ccc]'}`}>
                        {currentAnswer?.includes(opt.id) && '✔'}
                      </div>
                      {opt.text && <span>{opt.text}</span>}
                      <MediaRenderer media={opt.media} transform="thumbnail"/>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Fill in blank */}
              {currentQuestion.type === 'FILL_IN_THE_BLANK' && (
                <input type="text" value={currentAnswer || ''} onChange={e => handleAnswerChange(e.target.value)} className="w-full p-4 rounded-lg border-2 border-[#ccc] text-lg text-[#333] transition-all outline-none focus:border-[#4a00e0] focus:shadow-[0_0_0_4px_rgba(74,0,224,0.1)]"/>
              )}

              {/* Paragraph */}
              {currentQuestion.type === 'PARAGRAPH' && (
                <textarea value={currentAnswer || ''} onChange={e => handleAnswerChange(e.target.value)} className="w-full p-4 rounded-lg border-2 border-[#ccc] text-lg text-[#333] transition-all outline-none focus:border-[#4a00e0] focus:shadow-[0_0_0_4px_rgba(74,0,224,0.1)] resize-y min-h-[120px] font-sans"/>
              )}

              {/* Match the Following */}
              {currentQuestion.type === 'MATCH_THE_FOLLOWING' && currentAnswer && (
                <div className="grid grid-cols-[1.2fr_1fr] gap-8 items-start">
                  <div className="flex flex-col gap-4">
                    {currentQuestion.matchData.pairs.map(pair => (
                      <div key={pair.id} className="grid grid-cols-[1fr_auto] items-center gap-4 bg-[#f8fafc] rounded-lg p-2 border border-[#e2e8f0]">
                        <div className="flex items-center gap-2 pl-2 justify-end text-right text-[#475569] font-semibold">
                          <MediaRenderer media={pair.promptMedia} transform="thumbnail"/>
                          <span>{pair.prompt}</span>
                        </div>
                        <Droppable droppableId={String(pair.id)}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className={`border-2 border-dashed rounded-md min-h-[60px] flex items-center justify-center transition-colors ${currentAnswer.pairs[pair.id] ? 'bg-[#ede7f6] border-[#4a00e0]' : 'bg-white border-[#d1d5db]'}`}>
                              {currentAnswer.pairs[pair.id]
                                ? <Draggable draggableId={String(currentAnswer.pairs[pair.id].id)} index={0}>{(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={draggableMatched}><MediaRenderer media={currentAnswer.pairs[pair.id].answerMedia} transform="thumbnail"/><span>{currentAnswer.pairs[pair.id].answerText}</span></div>}</Draggable>
                                : <span className="text-sm text-[#9ca3af] italic">Drop here</span>}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-center font-semibold text-[#6b7280] uppercase tracking-wide text-sm mb-3">Answers</h4>
                    <Droppable droppableId="bank">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="bg-[#f1f5f9] p-4 rounded-xl min-h-[200px] flex flex-col gap-4">
                          {currentAnswer.bank.map((ans, i) => (
                            <Draggable key={ans.id} draggableId={String(ans.id)} index={i}>
                              {(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={draggableOption}><MediaRenderer media={ans.answerMedia} transform="thumbnail"/><span>{ans.answerText}</span></div>}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                </div>
              )}

              {/* Reorder */}
              {currentQuestion.type === 'REORDER' && currentAnswer && (
                <Droppable droppableId="reorder-list">
                  {(provided) => (
                    <motion.div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-3 bg-[#f7f9fc] p-4 rounded-lg border-2 border-dashed border-[#d1d5db]">
                      {currentAnswer.map((item, i) => (
                        <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                          {(p) => (
                            <motion.div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} layout className="p-4 bg-white border-l-[5px] border-[#6366f1] rounded-md text-[#2c3e50] shadow-[0_3px_6px_rgba(0,0,0,0.06)] text-[1.1rem] font-medium cursor-grab flex items-center gap-3">
                              <FaGripLines className="text-[#9ca3af] text-xl flex-shrink-0"/>
                              <MediaRenderer media={item.media} transform="thumbnail" className="w-[50px] h-[40px] rounded object-cover flex-shrink-0"/>
                              <span>{item.text}</span>
                            </motion.div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </motion.div>
                  )}
                </Droppable>
              )}

              {/* Categorize */}
              {currentQuestion.type === 'CATEGORIZE' && currentAnswer && (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
                    {currentQuestion.categorizeData.categories.map(cat => (
                      <Droppable key={cat.id} droppableId={String(cat.id)}>
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="bg-gradient-to-t from-[#f3e8ff] to-[#fdfcff] rounded-xl p-4 border border-[#e9d5ff] transition-colors shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
                            <h3 className="mt-0 text-center text-[#6d28d9] font-semibold pb-3 border-b-2 border-[#e9d5ff]">{cat.name}</h3>
                            <div className="min-h-[150px] pt-4 flex flex-col gap-3">
                              {currentAnswer[cat.id]?.map((item, i) => (
                                <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                                  {(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="p-3 bg-white border border-[#d1d5db] rounded-lg text-[#374151] shadow-[0_2px_4px_rgba(0,0,0,0.05)] cursor-grab font-medium flex items-center gap-2"><MediaRenderer media={item.media} transform="thumbnail"/><span>{item.text}</span></div>}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-center text-sm font-semibold text-[#6b7280] uppercase tracking-wide mb-3">Items to Sort</h4>
                    <Droppable droppableId="bank" direction="horizontal">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="bg-[#f3f4f6] p-4 rounded-xl flex flex-wrap justify-center gap-3 min-h-[60px] border-2 border-dashed border-[#d1d5db]">
                          {currentAnswer.bank?.map((item, i) => (
                            <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                              {(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="p-3 bg-[#e0e7ff] border border-[#c7d2fe] rounded-lg text-[#4338ca] cursor-grab font-medium flex items-center gap-2"><MediaRenderer media={item.media} transform="thumbnail"/><span>{item.text}</span></div>}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                </div>
              )}

              {/* Comprehension */}
              {(currentQuestion.type === 'VISUAL_COMPREHENSION' || currentQuestion.type === 'LISTENING_COMPREHENSION') && (
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-6">
                    {(currentQuestion.visualData?.subQuestions || currentQuestion.listeningData?.subQuestions).map((subQ, si) => (
                      <div key={subQ.id} className="border-t border-[#eee] pt-6">
                        <p className="font-semibold mb-4 text-[#2c3e50]">{si + 1}. {subQ.questionText}</p>
                        {subQ.type === 'MCQ' && (
                          <div className="grid gap-2">
                            {subQ.mcqData.options.map(opt => (
                              <div key={opt.id} className={`flex items-center gap-3 border-2 p-3 rounded-lg cursor-pointer transition-all ${currentAnswer[si]?.includes(opt.id) ? 'bg-[#ede7f6] border-[#4a00e0]' : 'border-[#eee] hover:border-[#8e2de2]'}`} onClick={() => handleAnswerChange(opt.id, si)}>
                                <div className={`font-semibold border-2 w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${currentAnswer[si]?.includes(opt.id) ? 'bg-[#4a00e0] text-white border-[#4a00e0]' : 'border-[#ccc]'}`}>{String.fromCharCode(65 + subQ.mcqData.options.indexOf(opt))}</div>
                                <span>{opt.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between w-full max-w-[800px]">
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handlePreviousQuestion} disabled={currentQuestionIndex === 0} className="flex items-center gap-2 px-8 py-3 border-none font-bold text-base rounded-lg cursor-pointer transition-all shadow-[0_4px_15px_rgba(0,0,0,0.1)] bg-[#f0f0f0] text-[#333] hover:bg-[#e0e0e0] disabled:bg-[#ccc] disabled:cursor-not-allowed disabled:text-[#888]">
            <FaArrowLeft /> Previous
          </motion.button>
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleNextQuestion(false)} className="flex items-center gap-2 px-8 py-3 border-none font-bold text-base rounded-lg cursor-pointer transition-all shadow-[0_4px_15px_rgba(0,0,0,0.1)] bg-gradient-to-r from-[#4776e6] to-[#8e54e9] text-white hover:shadow-[0_6px_20px_rgba(71,118,230,0.4)] hover:-translate-y-0.5">
            {currentQuestionIndex < quiz.questions.length - 1 ? 'Next' : 'Submit Quiz'} <FaArrowRight />
          </motion.button>
        </div>
      </div>
    </DragDropContext>
  );
};

export default TakeQuiz;

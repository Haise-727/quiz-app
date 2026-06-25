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
import { createNotification } from '../../utils/notifications';

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

      if (needsManual && quiz.createdBy) {
        try {
          const studentSnap = await getDoc(doc(db, 'users', user.uid));
          const studentName = studentSnap.exists() ? studentSnap.data().displayName || 'A student' : user.displayName || 'A student';
          await createNotification(
            quiz.createdBy,
            `${studentName} has submitted "${quiz.title}" which requires manual grading.`,
            'grading',
            { quizId, resultId: ref.id }
          );
        } catch (notifErr) {
          console.error("Error creating grading notification:", notifErr);
        }
      }
    } catch (err) { console.error('CRITICAL ERROR:', err); setError('A critical error occurred while submitting your quiz.'); setQuizSubmitted(false); }
  };

  // --- Loading / Error ---
  if (loading) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin"/>
      <p className="text-[hsl(var(--muted-foreground))] text-sm">Loading quiz...</p>
    </div>
  );
  if (error && !quizSubmitted) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center p-8">
      <p className="text-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] rounded-2xl px-8 py-6 shadow-sm">{error}</p>
    </div>
  );

  // --- Intro screen ---
  if (!quizStarted) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      <div className="relative z-10 bg-[hsl(var(--card))] text-[hsl(var(--foreground))] p-10 rounded-2xl w-full max-w-[550px] text-center border border-[hsl(var(--border))] shadow-sm animate-fade-in">
        <h1 className="text-[2.2rem] text-[hsl(var(--foreground))] mb-2 font-black leading-tight">{quiz.title}</h1>
        <p className="text-base text-[hsl(var(--muted-foreground))] mb-8 leading-relaxed">{quiz.description}</p>
        <div className="flex justify-around items-center bg-[hsl(var(--muted))]/50 rounded-xl p-4 mb-10 text-left border border-[hsl(var(--border))]">
          <div className="flex flex-col"><span className="text-xs text-[hsl(var(--muted-foreground))]">Questions:</span><strong className="text-lg text-[hsl(var(--foreground))]">{quiz.questions?.length ?? 0}</strong></div>
          <div className="flex flex-col"><span className="text-xs text-[hsl(var(--muted-foreground))]">Total Points:</span><strong className="text-lg text-[hsl(var(--foreground))]">{quiz.totalPoints}</strong></div>
        </div>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setQuizStarted(true)} className="w-full py-4 border-none font-bold text-lg rounded-xl cursor-pointer bg-[hsl(var(--primary))] text-white shadow hover:bg-[hsl(var(--primary))]/90 transition-colors">
          Start Quiz
        </motion.button>
      </div>
    </div>
  );

  // --- Completed screen ---
  if (quizSubmitted) return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      {finalResults ? (
        <div className="relative z-10 bg-[hsl(var(--card))] text-[hsl(var(--foreground))] p-10 rounded-2xl w-full max-w-[550px] text-center border border-[hsl(var(--border))] shadow-sm animate-fade-in">
          <h1 className="flex items-center justify-center gap-3 text-[2rem] font-black leading-tight text-[hsl(var(--foreground))] m-0"><FaCheckCircle className="text-[hsl(var(--primary))] text-[2.2rem]"/> Quiz Completed!</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 mb-8">Great work!</p>
          <div>
            <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-4">Your Results</h2>
            <div className="my-6 p-4 bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] rounded-xl text-base flex justify-center gap-8 text-[hsl(var(--muted-foreground))]">
              <div>Base Score: <span className="font-semibold text-[hsl(var(--foreground))]">{finalResults.score} / {finalResults.maxScore}</span></div>
              <div>Speed Bonus: <span className="font-bold text-[hsl(var(--primary))]">+{finalResults.bonus}</span></div>
            </div>
            <div className="w-[180px] h-[180px] mx-auto rounded-full bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] flex flex-col justify-center items-center my-8">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-80 -mb-1">Final Score</span>
              <span className="text-[4.2rem] font-black leading-tight">{finalResults.finalScore}</span>
            </div>
            {finalResults.status === 'pending' && <p className="mt-6 text-sm text-red-600 bg-red-500/10 p-4 rounded-xl border border-red-500/20">Some questions require manual grading by your teacher.</p>}
          </div>
          <div className="mt-8 flex gap-4 justify-center">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/student/dashboard')} className="px-8 py-3 border-none font-semibold text-base rounded-xl cursor-pointer bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white shadow">
              Back to Dashboard
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/student/results')} className="flex items-center gap-2 px-8 py-3 border border-[hsl(var(--border))] text-[hsl(var(--foreground))] bg-[hsl(var(--muted))]/40 font-semibold text-base rounded-xl cursor-pointer hover:bg-[hsl(var(--muted))]/80 transition-colors">
              <FaClipboardList /> View Review
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 bg-[hsl(var(--card))] text-[hsl(var(--foreground))] p-10 rounded-2xl w-full max-w-[550px] text-center border border-[hsl(var(--border))] shadow-sm flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin"/>
          <h2 className="text-lg font-bold">Submitting your answers...</h2>
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
  const optionBase = 'flex items-center gap-4 border border-[hsl(var(--border))] rounded-xl p-4 cursor-pointer transition-all text-base text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/50 hover:translate-x-1 bg-[hsl(var(--card))]';
  const optionSelected = 'bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))] text-[hsl(var(--primary))] font-semibold shadow-sm';
  const draggableOption = 'px-5 py-3 rounded-xl font-medium cursor-grab text-center shadow-sm text-white bg-[hsl(var(--primary))] flex items-center gap-2';
  const draggableMatched = 'px-5 py-3 rounded-xl font-medium cursor-default text-center shadow-sm text-white bg-[hsl(var(--primary))] flex items-center gap-2';

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-4 flex flex-col items-center justify-center relative overflow-x-hidden">
        {/* Decorative background grid and blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
        </div>

        {/* Header */}
        <div className="relative z-10 flex justify-between items-center w-full max-w-[800px] mb-4 px-4">
          <h1 className="text-2xl font-black text-[hsl(var(--foreground))] m-0">{quiz.title}</h1>
          <div className="font-bold text-sm bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] px-4 py-2 rounded-full">{timeLeft}s</div>
        </div>

        {/* Progress */}
        <div className="relative z-10 w-full max-w-[800px] mb-6">
          <div className="bg-[hsl(var(--muted))] border border-[hsl(var(--border))] h-2.5 rounded-full overflow-hidden mb-1.5">
            <div className="bg-[hsl(var(--primary))] h-full transition-[width] duration-300 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%` }}/>
          </div>
          <div className="text-xs text-right text-[hsl(var(--muted-foreground))]">Question {currentQuestionIndex + 1} of {quiz.questions.length}</div>
        </div>

        {/* Question card */}
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div className="bg-[hsl(var(--card))] text-[hsl(var(--foreground))] p-8 rounded-2xl max-w-[800px] w-full border border-[hsl(var(--border))] shadow-sm mb-6" key={currentQuestion.id} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ type: 'tween', ease: 'circOut', duration: 0.5 }}>
            {mainMedia && <MediaRenderer media={mainMedia} transform="question_main" className="block max-w-full max-h-[400px] mx-auto mb-6 rounded-lg"/>}
            <h2 className="text-2xl font-bold mb-8 leading-relaxed text-[hsl(var(--foreground))]">{currentQuestion.questionText}</h2>

            <div className="mt-4">
              {/* MCQ */}
              {currentQuestion.type === 'MCQ' && (
                <div className="grid gap-3">
                  {currentQuestion.mcqData.options.map(opt => (
                    <motion.div key={opt.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className={`${optionBase} ${currentAnswer?.includes(opt.id) ? optionSelected : ''}`} onClick={() => handleAnswerChange(opt.id)}>
                      <div className={`flex items-center justify-center h-7 w-7 flex-shrink-0 border rounded-full font-semibold transition-all ${currentAnswer?.includes(opt.id) ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))]'}`}>
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
                <input type="text" value={currentAnswer || ''} onChange={e => handleAnswerChange(e.target.value)} className="w-full p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-base text-[hsl(var(--foreground))] transition-all outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20"/>
              )}

              {/* Paragraph */}
              {currentQuestion.type === 'PARAGRAPH' && (
                <textarea value={currentAnswer || ''} onChange={e => handleAnswerChange(e.target.value)} className="w-full p-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-base text-[hsl(var(--foreground))] transition-all outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20 resize-y min-h-[120px] font-sans"/>
              )}
              {/* Match the Following */}
              {currentQuestion.type === 'MATCH_THE_FOLLOWING' && currentAnswer && (
                <div className="grid grid-cols-[1.2fr_1fr] gap-8 items-start">
                  <div className="flex flex-col gap-4">
                    {currentQuestion.matchData.pairs.map(pair => (
                      <div key={pair.id} className="grid grid-cols-[1fr_auto] items-center gap-4 bg-[hsl(var(--muted))]/20 rounded-xl p-2 border border-[hsl(var(--border))]">
                        <div className="flex items-center gap-2 pl-2 justify-end text-right text-[hsl(var(--foreground))] font-semibold">
                           <MediaRenderer media={pair.promptMedia} transform="thumbnail"/>
                          <span>{pair.prompt}</span>
                        </div>
                        <Droppable droppableId={String(pair.id)}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className={`border border-dashed rounded-xl min-h-[60px] flex items-center justify-center transition-colors ${currentAnswer.pairs[pair.id] ? 'bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]/30 border-[hsl(var(--border))]'}`}>
                              {currentAnswer.pairs[pair.id]
                                ? <Draggable draggableId={String(currentAnswer.pairs[pair.id].id)} index={0}>{(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={draggableMatched}><MediaRenderer media={currentAnswer.pairs[pair.id].answerMedia} transform="thumbnail"/><span>{currentAnswer.pairs[pair.id].answerText}</span></div>}</Draggable>
                                : <span className="text-sm text-[hsl(var(--muted-foreground))] italic">Drop here</span>}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-center font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide text-xs mb-3">Answers</h4>
                    <Droppable droppableId="bank">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="bg-[hsl(var(--muted))]/40 p-4 rounded-xl min-h-[200px] flex flex-col gap-4 border border-[hsl(var(--border))]">
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
                    <motion.div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-3 bg-[hsl(var(--muted))]/20 p-4 rounded-xl border border-dashed border-[hsl(var(--border))]">
                      {currentAnswer.map((item, i) => (
                        <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                          {(p) => (
                            <motion.div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} layout className="p-4 bg-[hsl(var(--card))] border border-[hsl(var(--border))] border-l-[5px] border-l-[hsl(var(--primary))] rounded-xl text-[hsl(var(--foreground))] shadow-sm text-base font-medium cursor-grab flex items-center gap-3">
                              <FaGripLines className="text-[hsl(var(--muted-foreground))] text-xl flex-shrink-0"/>
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
                          <div {...provided.droppableProps} ref={provided.innerRef} className="bg-[hsl(var(--card))] rounded-xl p-4 border border-[hsl(var(--border))] transition-colors shadow-sm">
                            <h3 className="mt-0 text-center text-[hsl(var(--primary))] font-semibold pb-3 border-b border-[hsl(var(--border))]">{cat.name}</h3>
                            <div className="min-h-[150px] pt-4 flex flex-col gap-3">
                              {currentAnswer[cat.id]?.map((item, i) => (
                                <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                                  {(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="p-3 bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--foreground))] shadow-sm cursor-grab font-medium flex items-center gap-2"><MediaRenderer media={item.media} transform="thumbnail"/><span>{item.text}</span></div>}
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
                    <h4 className="text-center text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">Items to Sort</h4>
                    <Droppable droppableId="bank" direction="horizontal">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="bg-[hsl(var(--muted))]/30 p-4 rounded-xl flex flex-wrap justify-center gap-3 min-h-[60px] border border-dashed border-[hsl(var(--border))]">
                          {currentAnswer.bank?.map((item, i) => (
                            <Draggable key={item.id} draggableId={String(item.id)} index={i}>
                              {(p) => <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="p-3 bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 rounded-lg text-[hsl(var(--primary))] cursor-grab font-medium flex items-center gap-2"><MediaRenderer media={item.media} transform="thumbnail"/><span>{item.text}</span></div>}
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
                    {(currentQuestion.visualData?.subQuestions || currentQuestion.listeningData?.subQuestions || []).map((subQ, si) => (
                      <div key={subQ.id} className="border-t border-[hsl(var(--border))] pt-6">
                        <p className="font-semibold mb-4 text-[hsl(var(--foreground))]">{si + 1}. {subQ.questionText}</p>
                        {subQ.type === 'MCQ' && (
                          <div className="grid gap-2">
                            {subQ.mcqData.options.map(opt => (
                              <div key={opt.id} className={`flex items-center gap-3 border p-3 rounded-xl cursor-pointer transition-all ${currentAnswer[si]?.includes(opt.id) ? 'bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 bg-[hsl(var(--card))]'}`} onClick={() => handleAnswerChange(opt.id, si)}>
                                <div className={`font-semibold border w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${currentAnswer[si]?.includes(opt.id) ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{String.fromCharCode(65 + subQ.mcqData.options.indexOf(opt))}</div>
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
        <div className="relative z-10 flex justify-between w-full max-w-[800px]">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handlePreviousQuestion} disabled={currentQuestionIndex === 0} className="flex items-center gap-2 px-8 py-3 border border-[hsl(var(--border))] font-bold text-base rounded-xl cursor-pointer transition-all shadow-sm bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:bg-[hsl(var(--muted))]/50 disabled:cursor-not-allowed disabled:text-[hsl(var(--muted-foreground))]">
            <FaArrowLeft /> Previous
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleNextQuestion(false)} className="flex items-center gap-2 px-8 py-3 border-none font-bold text-base rounded-xl cursor-pointer transition-all shadow bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-white">
            {currentQuestionIndex < quiz.questions.length - 1 ? 'Next' : 'Submit Quiz'} <FaArrowRight />
          </motion.button>
        </div>
      </div>
    </DragDropContext>
  );
};

export default TakeQuiz;

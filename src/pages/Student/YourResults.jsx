import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import MediaRenderer from '../../components/MediaRenderer';
import { FaTimes, FaArrowLeft, FaEye } from 'react-icons/fa';

const STATUS_STYLES = {
  'student-pending':   { border: 'border-l-[5px] border-[#ff9800]', num: 'bg-[#ff9800] text-white', pts: 'text-[#f57c00] bg-[#fff8e1]' },
  'student-correct':   { border: 'border-l-[5px] border-[#4caf50]', num: 'bg-[#4caf50] text-white', pts: 'text-[#4776e6] bg-[#eef2ff]' },
  'student-incorrect': { border: 'border-l-[5px] border-[#f44336]', num: 'bg-[#f44336] text-white', pts: 'text-[#f44336] bg-[#ffebee]' },
};

const QuestionReview = ({ originalQuestion, studentAnswerData, questionIndex }) => {
  const isPending = studentAnswerData.status === 'pending_review';
  const isCorrect = studentAnswerData.pointsAwarded >= originalQuestion.points;
  const statusKey = isPending ? 'student-pending' : isCorrect ? 'student-correct' : 'student-incorrect';
  const s = STATUS_STYLES[statusKey];
  const mainMedia = originalQuestion.visualData?.mainMedia || originalQuestion.listeningData?.mainMedia || originalQuestion.media;

  const renderUserAnswer = () => {
    const ua = studentAnswerData.userAnswer;
    if ((!ua && typeof ua !== 'string') || (Array.isArray(ua) && ua.length === 0)) return <p><i>No answer provided.</i></p>;
    switch (originalQuestion.type) {
      case 'MCQ': {
        const sel = new Set(ua || []);
        if (!sel.size) return <p><i>No answer provided.</i></p>;
        return <ul className="list-none p-0 m-0 flex flex-col gap-2">{originalQuestion.mcqData.options.filter(o => sel.has(o.id)).map(o => <li key={o.id} className="flex items-center gap-2"><MediaRenderer media={o.media} transform="thumbnail"/>{o.text}</li>)}</ul>;
      }
      case 'FILL_IN_THE_BLANK': case 'PARAGRAPH': return <p className="whitespace-pre-wrap m-0">{ua}</p>;
      case 'REORDER': return <ol className="list-none p-0 m-0 flex flex-col gap-2">{ua.map(i => <li key={i.id} className="flex items-center gap-2"><MediaRenderer media={i.media} transform="thumbnail"/>{i.text}</li>)}</ol>;
      case 'CATEGORIZE': return <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">{originalQuestion.categorizeData.categories.map(cat => <div key={cat.id}><strong className="block mb-1">{cat.name}:</strong><ul className="list-none p-0 m-0 flex flex-col gap-1">{(ua[cat.id] || []).map(i => <li key={i.id} className="flex items-center gap-2"><MediaRenderer media={i.media} transform="thumbnail"/>{i.text}</li>)}</ul></div>)}</div>;
      case 'MATCH_THE_FOLLOWING': return <ul className="list-none p-0 m-0 flex flex-col gap-2">{originalQuestion.matchData.pairs.map(p => <li key={p.id}><div className="flex items-center gap-2 flex-wrap"><div className="flex items-center gap-1 bg-[#f1f5f9] px-2 py-1 rounded"><MediaRenderer media={p.promptMedia} transform="thumbnail"/>{p.prompt}</div><span>→</span><div className="flex items-center gap-1 bg-[#f1f5f9] px-2 py-1 rounded">{ua.pairs?.[p.id] ? <><MediaRenderer media={ua.pairs[p.id].answerMedia} transform="thumbnail"/>{ua.pairs[p.id].answerText}</> : <i>(unmatched)</i>}</div></div></li>)}</ul>;
      default: return <p><i>Review unavailable for this question type.</i></p>;
    }
  };

  const renderCorrectAnswer = () => {
    switch (originalQuestion.type) {
      case 'MCQ': return <ul className="list-none p-0 m-0 flex flex-col gap-2">{originalQuestion.mcqData.correctOptions.map(id => { const o = originalQuestion.mcqData.options.find(x => x.id === id); return <li key={id} className="flex items-center gap-2"><MediaRenderer media={o?.media} transform="thumbnail"/>{o?.text}</li>; })}</ul>;
      case 'FILL_IN_THE_BLANK': return <p className="m-0">{originalQuestion.fillBlankData.answers.map(a => a.text).join(' / ')}</p>;
      case 'REORDER': return <ol className="list-none p-0 m-0 flex flex-col gap-2">{originalQuestion.reorderData.items.map(i => <li key={i.id} className="flex items-center gap-2"><MediaRenderer media={i.media} transform="thumbnail"/>{i.text}</li>)}</ol>;
      case 'CATEGORIZE': return <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">{originalQuestion.categorizeData.categories.map(cat => <div key={cat.id}><strong className="block mb-1">{cat.name}:</strong><ul className="list-none p-0 m-0 flex flex-col gap-1">{originalQuestion.categorizeData.items.filter(i => i.categoryId === cat.id).map(i => <li key={i.id} className="flex items-center gap-2"><MediaRenderer media={i.media} transform="thumbnail"/>{i.text}</li>)}</ul></div>)}</div>;
      case 'MATCH_THE_FOLLOWING': return <ul className="list-none p-0 m-0 flex flex-col gap-2">{originalQuestion.matchData.pairs.map(p => <li key={p.id}>{p.prompt} → {p.answer}</li>)}</ul>;
      default: return null;
    }
  };

  return (
    <div className={`bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-6 ${s.border}`}>
      <div className="flex items-center gap-4 mb-4">
        <span className={`flex-shrink-0 font-bold text-sm w-9 h-9 rounded-full flex items-center justify-center ${s.num}`}>Q{questionIndex + 1}</span>
        <p className="flex-1 font-semibold text-[#1e293b] m-0">{originalQuestion.questionText}</p>
        <span className={`font-bold text-[0.9rem] px-3 py-1.5 rounded-full ${s.pts}`}>{isPending ? 'Pending' : `${studentAnswerData.pointsAwarded} / ${originalQuestion.points}`}</span>
      </div>
      {mainMedia && <div className="w-full max-h-[400px] mb-6 rounded-lg overflow-hidden"><MediaRenderer media={mainMedia} transform="question_main"/></div>}
      <div className="flex flex-col gap-4 pl-[52px]">
        <div className="rounded-lg p-4 bg-[#eef2ff] border border-[#c7d2fe]">
          <label className="block font-semibold text-xs text-[#4338ca] uppercase tracking-wide mb-1">Your Answer</label>
          <div className="text-[#1e293b]">{renderUserAnswer()}</div>
        </div>
        {!isCorrect && !isPending && (
          <div className="rounded-lg p-4 bg-[#f0fdf4] border border-[#bbf7d0]">
            <label className="block font-semibold text-xs text-[#166534] uppercase tracking-wide mb-1">Correct Answer(s)</label>
            <div className="text-[#15803d]">{renderCorrectAnswer()}</div>
          </div>
        )}
      </div>
    </div>
  );
};

const YourResults = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  const [modalQuizDetails, setModalQuizDetails] = useState(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) { setLoading(false); navigate('/login'); return; }
    const fetchResults = async () => {
      try {
        setLoading(true); setError('');
        const snap = await getDocs(query(collection(db, 'quiz_results'), where('userId', '==', currentUser.uid), orderBy('completedAt', 'desc')));
        setResults(snap.docs.map(d => {
          const data = d.data();
          const displayScore = data.status === 'completed' ? data.finalScore : data.score;
          const percentage = data.maxScore > 0 ? Math.round((displayScore / data.maxScore) * 100) : 0;
          const correctCount = (data.answers || []).filter(a => a.pointsAwarded > 0).length;
          return { id: d.id, ...data, displayScore, percentage, correctCount };
        }));
      } catch (err) { setError(`Failed to load results: ${err.message}`); }
      finally { setLoading(false); }
    };
    fetchResults();
  }, [currentUser, navigate]);

  const handleViewDetails = async (result) => {
    if (!result?.quizId) { setError('Cannot view details for this result.'); return; }
    setSelectedResult(result); setIsModalLoading(true);
    try {
      const snap = await getDoc(doc(db, 'quizzes', result.quizId));
      if (snap.exists()) setModalQuizDetails(snap.data());
      else setError('Could not load original quiz details. It may have been deleted.');
    } catch { setError('Error loading quiz details.'); }
    finally { setIsModalLoading(false); }
  };

  const closeModal = () => { setSelectedResult(null); setModalQuizDetails(null); };

  const getScoreBadge = (pct, status) => {
    if (status !== 'completed') return 'bg-gradient-to-br from-[#78909c] to-[#546e7a] text-white';
    if (pct >= 80) return 'bg-gradient-to-br from-[#4caf50] to-[#2e7d32] text-white';
    if (pct >= 60) return 'bg-gradient-to-br from-[#2196f3] to-[#1565c0] text-white';
    if (pct >= 40) return 'bg-gradient-to-br from-[#ff9800] to-[#f57c00] text-white';
    return 'bg-gradient-to-br from-[#f44336] to-[#d32f2f] text-white';
  };

  const formatRelativeDate = (ts) => {
    if (!ts?.toDate) return { relative: 'Invalid Date', full: '' };
    const d = ts.toDate(), now = new Date();
    const s = Math.round((now - d) / 1000);
    const full = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (s < 60) return { relative: 'Just now', full };
    const m = Math.round(s / 60);
    if (m < 60) return { relative: `${m} minute${m > 1 ? 's' : ''} ago`, full };
    const h = Math.round(m / 60);
    if (h < 24) return { relative: `${h} hour${h > 1 ? 's' : ''} ago`, full };
    const dy = Math.round(h / 24);
    if (dy === 1) return { relative: 'Yesterday', full };
    if (dy < 7) return { relative: `${dy} day${dy > 1 ? 's' : ''} ago`, full };
    return { relative: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), full };
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen w-screen bg-gradient-to-br from-[#3a1c71] to-[#4776e6] text-white text-xl font-semibold gap-4">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"/>
        <p>Loading your results...</p>
      </div>
    );
  }

  return (
    <div className="relative flex items-start justify-center min-h-screen w-screen p-8 bg-gradient-to-br from-[#3a1c71] to-[#4776e6] overflow-x-hidden">
      <div className="w-full max-w-[1400px] bg-white/95 rounded-2xl p-12 text-[#333] shadow-[0_20px_60px_rgba(0,0,0,0.1)] backdrop-blur-xl mt-16 max-h-[calc(100vh-140px)] overflow-y-auto relative z-10 animate-fade-in">

        {/* Header */}
        <div className="flex justify-between items-center mb-8 pb-4 border-b-2 border-[#4776e6]">
          <button onClick={() => navigate('/student/dashboard')} className="flex items-center gap-2 bg-gradient-to-br from-[#4776e6] to-[#3a1c71] text-white border-none rounded-full px-6 py-3 font-semibold cursor-pointer transition-all shadow-[0_4px_15px_rgba(71,118,230,0.3)] hover:-translate-y-0.5 hover:shadow-[0_8px_25px_rgba(71,118,230,0.4)]">
            <FaArrowLeft /> Back to Dashboard
          </button>
          <h1 className="flex-1 text-center text-[2.5rem] font-bold m-0 bg-gradient-to-r from-[#4776e6] to-[#3a1c71] bg-clip-text text-transparent">Your Results</h1>
          <div className="bg-gradient-to-br from-[#4776e6] to-[#3a1c71] text-white px-4 py-2 rounded-full font-semibold text-sm shadow-[0_4px_15px_rgba(71,118,230,0.3)]">
            {results.length} Result{results.length !== 1 ? 's' : ''}
          </div>
        </div>

        {error && <div className="bg-[#fff8f8] text-[#d32f2f] px-4 py-3 border-l-4 border-[#d32f2f] mb-6 rounded-r-lg flex items-center gap-2"><FaTimes />{error}</div>}

        {results.length === 0 ? (
          <div className="text-center py-16 px-8 text-[#666]">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-[#4776e6] mb-4 text-3xl font-bold">No Quiz Results Yet</h3>
            <p className="mb-8 text-lg opacity-80">Complete a quiz to see your results here.</p>
            <button onClick={() => navigate('/student/attend-quiz')} className="bg-gradient-to-br from-[#4776e6] to-[#3a1c71] text-white border-none rounded-full px-8 py-4 text-lg font-semibold cursor-pointer shadow-[0_8px_20px_rgba(71,118,230,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(71,118,230,0.4)]">
              Take a Quiz
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-8 mt-8">
            {results.map((result) => {
              const { relative, full } = formatRelativeDate(result.completedAt);
              return (
                <div key={result.id} className="bg-white rounded-2xl p-8 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all hover:-translate-y-1.5 hover:shadow-[0_15px_35px_rgba(0,0,0,0.12)] border border-[rgba(0,0,0,0.05)] relative overflow-hidden">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="text-[#333] m-0 text-xl font-bold flex-1 mr-4 leading-snug">{result.quizTitle}</h3>
                    <div className={`px-4 py-2 rounded-full text-base font-bold uppercase tracking-wide min-w-[60px] text-center ${getScoreBadge(result.percentage, result.status)}`}>
                      {result.status === 'completed' ? `${result.percentage}%` : 'Pending'}
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex flex-wrap gap-4 mb-6">
                      <div className="flex items-center gap-2 text-[#666] text-sm"><span>{result.correctCount}/{result.answers?.length} Correct</span></div>
                      <div className="flex items-center gap-2 text-[#666] text-sm" title={full}><span>{relative}</span></div>
                    </div>
                    <div className="bg-[#f8fafc] rounded-xl p-4 border border-[#e2e8f0]">
                      <div className="w-full bg-[#e2e8f0] rounded-full h-3 overflow-hidden mb-2">
                        <div className="h-full bg-gradient-to-r from-[#4776e6] to-[#3a1c71] rounded-full transition-[width] duration-1000" style={{ width: `${result.percentage}%` }}/>
                      </div>
                      <div className="text-sm text-[#666] text-center font-semibold">
                        {result.status === 'completed' ? `Final Score: ${result.finalScore} / ${result.maxScore}` : `Auto-Graded Score: ${result.score}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-center pt-4 border-t border-[#e2e8f0]">
                    <button onClick={() => handleViewDetails(result)} className="bg-gradient-to-br from-[#4776e6] to-[#3a1c71] text-white border-none rounded-xl px-6 py-2.5 font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.15)] flex items-center gap-2">
                      <FaEye /> View Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-8 animate-fade-in" onClick={closeModal}>
          <div className="bg-white rounded-2xl w-full max-w-[900px] max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.3)] animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-8 py-6 border-b-2 border-[#4776e6] sticky top-0 bg-white z-10">
              <h2 className="text-[#4776e6] m-0 text-3xl font-bold">{selectedResult.quizTitle} - Review</h2>
              <button onClick={closeModal} className="bg-none border-none text-2xl text-[#666] cursor-pointer p-2 rounded-full transition-all hover:bg-[#f5f5f5] hover:text-[#333] w-10 h-10 flex items-center justify-center"><FaTimes /></button>
            </div>
            <div className="p-8">
              {isModalLoading ? (
                <div className="flex flex-col justify-center items-center min-h-[300px] text-[#666] gap-4">
                  <div className="w-10 h-10 border-4 border-[#e2e8f0] border-t-[#4776e6] rounded-full animate-spin"/>
                  <p>Loading review...</p>
                </div>
              ) : modalQuizDetails ? (
                <div className="flex flex-col gap-6">
                  {modalQuizDetails.questions.map((q, i) => (
                    <QuestionReview key={q.id || i} originalQuestion={q} studentAnswerData={{ ...selectedResult.answers[i], questionIndex: i }} questionIndex={i} />
                  ))}
                </div>
              ) : (
                <div className="bg-[#fff8f8] text-[#d32f2f] px-4 py-3 border-l-4 border-[#d32f2f] rounded-r-lg">Could not load review details for this quiz.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YourResults;

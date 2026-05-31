import React, { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaTimes, FaCheckCircle, FaHourglassHalf } from 'react-icons/fa';
import MediaRenderer from '../../components/MediaRenderer';

const AnswerToGrade = ({ originalQuestion, answer, onPointsChange, isGraded }) => {
  const renderUserAnswer = () => {
    const ua = answer.userAnswer;
    if ((!ua && typeof ua !== 'string') || (Array.isArray(ua) && ua.length === 0)) return <p><i>No answer provided.</i></p>;
    switch (originalQuestion.type) {
      case 'MCQ': return <ul className="list-none p-0 m-0 flex flex-col gap-1">{originalQuestion.mcqData.options.filter(o => ua.includes(o.id)).map(o => <li key={o.id} className="flex items-center gap-2"><MediaRenderer media={o.media} transform="thumbnail"/>{o.text || 'Media Answer'}</li>)}</ul>;
      case 'FILL_IN_THE_BLANK': case 'PARAGRAPH': return <p className="whitespace-pre-wrap m-0">{ua}</p>;
      case 'REORDER': return <ol className="list-none p-0 m-0 flex flex-col gap-1">{ua.map(i => <li key={i.id} className="flex items-center gap-2"><MediaRenderer media={i.media} transform="thumbnail"/>{i.text}</li>)}</ol>;
      case 'CATEGORIZE': return <div>{originalQuestion.categorizeData.categories.map(cat => <div key={cat.id}><strong>{cat.name}:</strong><ul className="list-none p-0 pl-2 m-0">{(ua[cat.id] || []).map(i => <li key={i.id} className="flex items-center gap-2"><MediaRenderer media={i.media} transform="thumbnail"/>{i.text}</li>)}</ul></div>)}</div>;
      case 'MATCH_THE_FOLLOWING': return <ul className="list-none p-0 m-0 flex flex-col gap-2">{originalQuestion.matchData.pairs.map(p => <li key={p.id}><div className="flex items-center gap-2"><div className="flex items-center gap-1 bg-[#f0f0f0] px-2 py-1 rounded"><MediaRenderer media={p.promptMedia} transform="thumbnail"/>{p.prompt}</div><span>→</span><div className="flex items-center gap-1 bg-[#f0f0f0] px-2 py-1 rounded">{ua.pairs?.[p.id] ? <><MediaRenderer media={ua.pairs[p.id].answerMedia} transform="thumbnail"/>{ua.pairs[p.id].answerText}</> : <i>(unmatched)</i>}</div></div></li>)}</ul>;
      default: return <p><i>Review unavailable.</i></p>;
    }
  };

  return (
    <div className="bg-[#fafafa] border border-[#eee] rounded-xl p-6 mb-6">
      <h4 className="text-[#333] mt-0 mb-4 border-b border-[#ddd] pb-2">{answer.questionIndex + 1}. {originalQuestion.questionText}</h4>
      <div className="flex gap-6">
        <div className="flex-[2]">
          <label className="block font-semibold text-[#555] mb-2 text-sm">Student's Answer</label>
          <div className="bg-white border border-[#ddd] rounded-lg p-4 min-h-[80px] text-base text-[#333]">{renderUserAnswer()}</div>
        </div>
        <div className="flex-1 flex flex-col gap-4">
          {originalQuestion.paragraphData?.keywords?.length > 0 && (
            <div>
              <label className="block font-semibold text-[#555] mb-2 text-sm">Grading Keywords</label>
              <div className="flex flex-wrap gap-2">{originalQuestion.paragraphData.keywords.map((kw, i) => <span key={i} className="bg-[#e0e0e0] text-[#333] px-2 py-1 rounded-full text-sm">{kw.text}</span>)}</div>
            </div>
          )}
          <div>
            <label className="block font-semibold text-[#555] mb-2 text-sm text-center">Points Awarded</label>
            <div className={`flex items-center bg-white border-2 rounded-xl transition-colors ${!isGraded ? 'focus-within:border-[#e85a19]' : 'border-[#ddd]'}`}>
              <input
                type="number"
                value={answer.pointsAwarded === null || answer.pointsAwarded === undefined ? '' : answer.pointsAwarded}
                onChange={(e) => onPointsChange(e.target.value)}
                max={originalQuestion.points} min="0" disabled={isGraded}
                className="border-none bg-transparent outline-none w-full p-3 text-[1.8rem] font-bold text-center text-[#e85a19] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xl font-medium text-[#777] pr-4">/ {originalQuestion.points}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Grading = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const auth = getAuth();
  const [loading, setLoading] = useState(true);
  const [quizDetails, setQuizDetails] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoading(true); setError('');
    try {
      const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
      if (!quizSnap.exists() || quizSnap.data().createdBy !== auth.currentUser.uid) {
        setError("Quiz not found or you don't have permission."); setLoading(false); return;
      }
      setQuizDetails(quizSnap.data());

      const subsSnap = await getDocs(query(collection(db, 'quiz_results'), where('quizId', '==', quizId)));
      const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const userIds = [...new Set(subs.map(s => s.userId))];
      const names = {};
      if (userIds.length) {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', userIds)));
        usersSnap.forEach(d => { names[d.id] = d.data().displayName || d.data().email; });
      }

      const withNames = subs.map(s => ({ ...s, userName: names[s.userId] || 'Unknown Student' }));
      withNames.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.completedAt?.toDate()) - new Date(a.completedAt?.toDate());
      });
      setSubmissions(withNames);
    } catch (err) { setError('Failed to load submissions.'); console.error(err); }
    finally { setLoading(false); }
  }, [quizId, auth.currentUser]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => { if (u) fetchSubmissions(); else navigate('/login'); });
    return () => unsub();
  }, [fetchSubmissions, navigate]);

  const handleOpenModal = (sub) => {
    setSelectedSubmission({ ...sub, answers: sub.answers.map((a, i) => ({ ...a, questionIndex: i })) });
    setIsModalOpen(true);
  };

  const handlePointsChange = (qi, pts) => {
    const points = pts === '' ? null : parseInt(pts, 10);
    const max = quizDetails.questions[qi].points;
    setSelectedSubmission(cur => ({
      ...cur,
      answers: cur.answers.map((a, i) => i === qi ? { ...a, pointsAwarded: (points === null ? null : (!isNaN(points) && points >= 0 && points <= max) ? points : a.pointsAwarded) } : a),
    }));
  };

  const handleSubmitGrading = async () => {
    if (!selectedSubmission) return;
    setIsSaving(true);
    const total = selectedSubmission.answers.reduce((s, a) => s + (a.pointsAwarded || 0), 0);
    const updatedAnswers = selectedSubmission.answers.map(a => ({ ...a, status: 'manually_graded', pointsAwarded: a.pointsAwarded ?? 0 }));
    try {
      await updateDoc(doc(db, 'quiz_results', selectedSubmission.id), {
        score: total, finalScore: total + (selectedSubmission.bonus || 0), answers: updatedAnswers, status: 'completed',
      });
      fetchSubmissions(); setIsModalOpen(false); setSelectedSubmission(null);
    } catch (err) { setError('Could not save the grade.'); console.error(err); }
    finally { setIsSaving(false); }
  };

  if (loading) return <div className="flex justify-center items-center h-screen w-screen bg-gradient-to-br from-[#f12711] to-[#f5af19] text-white text-2xl font-semibold">Loading Submissions...</div>;

  return (
    <div className="flex justify-center min-h-screen w-screen pt-20 px-8 pb-8 bg-gradient-to-br from-[#f12711] to-[#f5af19] text-white">
      <div className="w-full max-w-[1100px] bg-white rounded-2xl p-8 text-[#333] shadow-[0_15px_40px_rgba(0,0,0,0.25)] animate-fade-in">

        {/* Header */}
        <div className="flex justify-between items-center mb-8 pb-4 border-b-[3px] border-[#f5af19]">
          <button onClick={() => navigate('/teacher/your-quizzes')} className="flex items-center gap-2 bg-[#f7f7f7] border border-[#ddd] text-[#555] px-5 py-2.5 rounded-full font-semibold cursor-pointer transition-all hover:bg-[#eee]"><FaArrowLeft /> Your Quizzes</button>
          <h1 className="flex-1 text-center text-[#e85a19] text-[2.2rem] m-0 mx-4 font-bold">{quizDetails ? `Grading: ${quizDetails.title}` : 'Grading'}</h1>
          <div className="bg-[#e85a19] text-white px-4 py-2 rounded-full font-bold text-sm">{submissions.length} Submissions</div>
        </div>

        {error && <div className="bg-[#fff8f8] text-[#d32f2f] px-4 py-3 border-l-4 border-[#d32f2f] mb-6 rounded-r-lg">{error}</div>}

        {submissions.length === 0 ? (
          <div className="text-center py-16 text-[#777]">
            <h3 className="text-xl text-[#333] mb-2">No Submissions Yet</h3>
            <p>Check back later once students have completed the quiz.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {submissions.map(sub => (
              <div key={sub.id} className="grid grid-cols-[2fr_1fr_1.5fr_1fr] items-center gap-6 p-6 bg-[#fdfdfd] rounded-xl border-l-[5px] border-[#ccc] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.08)] hover:border-l-[#f5af19]">
                <div>
                  <span className="block font-semibold text-lg text-[#333]">{sub.userName}</span>
                  <span className="text-sm text-[#777]">{sub.userEmail}</span>
                </div>
                <div className="text-center">
                  <span className="block text-xs text-[#888] uppercase mb-1">Score</span>
                  <span className="text-2xl font-bold text-[#e85a19]">{sub.status === 'completed' ? `${sub.finalScore} / ${sub.maxScore}` : `${sub.score} / ${sub.maxScore}`}</span>
                </div>
                <div className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-full font-semibold text-sm ${sub.status === 'completed' ? 'bg-[#e8f5e9] text-[#43a047]' : 'bg-[#fff8e1] text-[#f57c00]'}`}>
                  {sub.status === 'completed' ? <><FaCheckCircle/> Completed</> : <><FaHourglassHalf/> Pending Review</>}
                </div>
                <button onClick={() => handleOpenModal(sub)} className="px-6 py-3 rounded-lg border-none font-semibold text-white bg-gradient-to-r from-[#673ab7] to-[#512da8] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(103,58,183,0.4)]">
                  {sub.status === 'completed' ? 'View Graded' : 'Grade Now'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grading Modal */}
      {isModalOpen && selectedSubmission && quizDetails && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-8 animate-fade-in" onClick={() => { setIsModalOpen(false); setSelectedSubmission(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col shadow-xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-8 py-6 border-b border-[#eee] sticky top-0 bg-white z-10 rounded-t-2xl">
              <h2 className="m-0 text-xl font-semibold text-[#333]">Grade: {selectedSubmission.userName}</h2>
              <button onClick={() => { setIsModalOpen(false); setSelectedSubmission(null); }} className="bg-[#f0f0f0] border-none text-[#555] w-8 h-8 rounded-full cursor-pointer flex items-center justify-center transition-all hover:bg-[#e0e0e0]"><FaTimes /></button>
            </div>
            <div className="overflow-y-auto py-2 px-8 max-h-[70vh]">
              {quizDetails.questions.map((q, i) => (
                <AnswerToGrade key={q.id || i} originalQuestion={q} answer={selectedSubmission.answers[i]} onPointsChange={(pts) => handlePointsChange(i, pts)} isGraded={selectedSubmission.status === 'completed'} />
              ))}
            </div>
            {selectedSubmission.status !== 'completed' && (
              <div className="flex justify-end gap-4 p-6 border-t border-[#eee]">
                <button onClick={() => { setIsModalOpen(false); setSelectedSubmission(null); }} className="bg-[#f0f0f0] text-[#555] border-none rounded-lg px-6 py-3 font-semibold cursor-pointer text-base">Cancel</button>
                <button onClick={handleSubmitGrading} disabled={isSaving} className="bg-gradient-to-r from-[#4caf50] to-[#43a047] text-white border-none rounded-lg px-6 py-3 font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(76,175,80,0.3)] disabled:bg-[#9e9e9e] disabled:cursor-not-allowed text-base">
                  {isSaving ? 'Saving...' : 'Save & Complete Grade'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Grading;

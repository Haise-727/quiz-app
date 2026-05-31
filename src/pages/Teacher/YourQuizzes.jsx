import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { db } from '../../firebase';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaCopy, FaChartBar, FaMarker, FaTrash, FaArrowLeft, FaTimes, FaPen } from 'react-icons/fa';
import MediaRenderer from '../../components/MediaRenderer';

const QuestionDetailsPreview = ({ question, index }) => {
  const mainMedia = question.visualData?.mainMedia || question.listeningData?.mainMedia || question.media;
  return (
    <div className="bg-[#f9f9f9] rounded-xl p-6 border border-[#eee]">
      <div className="flex items-center gap-4 mb-4">
        <span className="bg-[#e85a19] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-sm">{index + 1}</span>
        <span className="bg-[#eee] text-[#555] px-2.5 py-1 rounded-full text-xs font-semibold capitalize">{question.type.replace(/_/g, ' ')}</span>
        <span className="ml-auto font-semibold text-[#555]">{question.points} Pts</span>
      </div>
      {mainMedia && <MediaRenderer media={mainMedia} transform="question_main" />}
      <p className="font-semibold mb-4 leading-relaxed text-[#333]">{question.questionText}</p>
      <div>
        {question.mcqData?.options && (
          <ul className="list-none p-0 pl-4 m-0 flex flex-col gap-2">
            {question.mcqData.options.map(opt => (
              <li key={opt.id} className={`p-2 rounded flex items-center gap-2 ${question.mcqData.correctOptions.includes(opt.id) ? 'bg-[#e8f5e9] text-[#2e7d32] font-semibold' : ''}`}>
                <MediaRenderer media={opt.media} transform="thumbnail"/><span>{opt.text}</span>
              </li>
            ))}
          </ul>
        )}
        {question.fillBlankData?.answers && <p className="text-sm text-[#666]">Correct: {question.fillBlankData.answers.map(a => `"${a.text}"`).join(', ')}</p>}
        {question.matchData?.pairs && (
          <ul className="list-none p-0 pl-4 m-0 flex flex-col gap-2">
            {question.matchData.pairs.map(p => (
              <li key={p.id} className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#f0f0f0] px-2 py-1 rounded"><MediaRenderer media={p.promptMedia} transform="thumbnail"/><span>{p.prompt}</span></div>
                <span>↔</span>
                <div className="flex items-center gap-1 bg-[#f0f0f0] px-2 py-1 rounded"><MediaRenderer media={p.answerMedia} transform="thumbnail"/><span>{p.answer}</span></div>
              </li>
            ))}
          </ul>
        )}
        {question.categorizeData && question.categorizeData.categories.map(cat => (
          <div key={cat.id} className="mb-2">
            <strong>{cat.name}:</strong>
            <ul className="list-none p-0 pl-4 m-0 flex flex-col gap-1">
              {question.categorizeData.items.filter(i => i.categoryId === cat.id).map(item => <li key={item.id} className="flex items-center gap-1"><MediaRenderer media={item.media} transform="thumbnail"/>{item.text}</li>)}
            </ul>
          </div>
        ))}
        {question.reorderData?.items && (
          <ol className="list-decimal pl-8 m-0 flex flex-col gap-1">
            {question.reorderData.items.map(item => <li key={item.id} className="flex items-center gap-1"><MediaRenderer media={item.media} transform="thumbnail"/>{item.text}</li>)}
          </ol>
        )}
      </div>
    </div>
  );
};

const YourQuizzes = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (u) setUser(u); else { setLoading(false); navigate('/login'); } });
    return () => unsub();
  }, [auth, navigate]);

  useEffect(() => { if (user) fetchQuizzes(); }, [user]);

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'quizzes'), where('createdBy', '==', user.uid), orderBy('createdAt', 'desc')));
      setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { setError('Error loading quizzes: ' + e.message); }
    finally { setLoading(false); }
  };

  const flash = (setter, msg, ms = 2000) => { setter(msg); setTimeout(() => setter(''), ms); };

  const handleCopyCode = async (code) => {
    try { await navigator.clipboard.writeText(code); flash(setSuccessMessage, 'Quiz code copied!'); }
    catch { flash(setError, 'Failed to copy code', 3000); }
  };

  const handleToggleActive = async (quiz) => {
    const next = !quiz.active;
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), { active: next });
      setQuizzes(q => q.map(x => x.id === quiz.id ? { ...x, active: next } : x));
      flash(setSuccessMessage, `Quiz ${next ? 'activated' : 'deactivated'}.`);
    } catch { setError('Error updating quiz status.'); }
  };

  const handleDeleteQuiz = async () => {
    if (!quizToDelete) return;
    try {
      await deleteDoc(doc(db, 'quizzes', quizToDelete.id));
      setQuizzes(q => q.filter(x => x.id !== quizToDelete.id));
      setShowDeleteModal(false); setQuizToDelete(null);
      flash(setSuccessMessage, 'Quiz deleted successfully.', 3000);
    } catch (e) { setError('Error deleting quiz: ' + e.message); }
  };

  const formatDate = (ts) => {
    if (!ts?.toDate) return 'Unknown date';
    return ts.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading) return <div className="flex justify-center items-center h-screen w-screen bg-gradient-to-br from-[#f12711] to-[#f5af19] text-white text-2xl font-semibold">Loading...</div>;

  const Btn = ({ onClick, cls, title, children }) => (
    <button onClick={onClick} title={title} className={`p-2.5 border-none rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md w-10 h-10 flex items-center justify-center text-base ${cls}`}>{children}</button>
  );

  const Modal = ({ onClose, children, wide = false }) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] p-8 animate-fade-in" onClick={onClose}>
      <div className={`bg-white rounded-2xl w-full ${wide ? 'max-w-[800px]' : 'max-w-[500px]'} max-h-[90vh] overflow-y-auto shadow-lg flex flex-col animate-slide-up`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );

  return (
    <div className="relative flex items-start justify-center min-h-screen w-screen p-8 bg-gradient-to-br from-[#f12711] to-[#f5af19] overflow-x-hidden">
      {/* Fixed sign-out button */}
      <button onClick={() => getAuth().signOut().then(() => navigate('/login'))} className="fixed top-8 right-8 bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-full px-5 py-2 font-semibold cursor-pointer transition-all z-10 hover:bg-white/30">
        Sign Out
      </button>

      <div className="w-full max-w-[1400px] bg-white rounded-2xl p-10 shadow-[0_10px_40px_rgba(0,0,0,0.2)] mt-16 max-h-[calc(100vh-120px)] overflow-y-auto animate-fade-in">

        {/* Header */}
        <div className="flex justify-between items-center mb-8 pb-6 border-b-2 border-[#f5af19]">
          <button onClick={() => navigate('/teacher/home')} className="flex items-center gap-2 bg-[#f0f0f0] text-[#555] border border-[#ddd] rounded-full px-5 py-2.5 font-semibold cursor-pointer transition-all hover:bg-[#e0e0e0]"><FaArrowLeft /> Dashboard</button>
          <h1 className="text-[2.2rem] m-0 text-center flex-1 font-bold text-[#f12711]">Your Quizzes</h1>
          <div className="bg-[#e85a19] text-white px-4 py-2 rounded-full font-semibold text-sm">{quizzes.length} Quiz{quizzes.length !== 1 ? 'es' : ''}</div>
        </div>

        {error && <div className="bg-[#fff8f8] text-[#d32f2f] px-4 py-3 border-l-4 border-[#d32f2f] mb-6 rounded-r-lg">{error}</div>}
        {successMessage && <div className="bg-[#f0fff4] text-[#4CAF50] px-4 py-3 border-l-4 border-[#4CAF50] mb-6 rounded-r-lg font-bold">{successMessage}</div>}

        {quizzes.length === 0 ? (
          <div className="text-center py-16 px-8 text-[#666]">
            <div className="text-6xl text-[#f5af19] mb-4"><i className="fas fa-clipboard-list"/></div>
            <h3 className="text-[#333] mb-4 text-3xl">No Quizzes Created Yet</h3>
            <p className="mb-8 text-lg">Create your first quiz to get started!</p>
            <button onClick={() => navigate('/teacher/home')} className="bg-gradient-to-r from-[#f12711] to-[#f5af19] text-white border-none rounded-full px-8 py-4 text-lg font-semibold cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_5px_15px_rgba(232,90,25,0.3)]">Create a Quiz</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-8 mt-8">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="bg-white rounded-2xl p-6 shadow-[0_5px_15px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-1.5 hover:shadow-[0_10px_25px_rgba(0,0,0,0.1)] border-l-[5px] border-transparent hover:border-l-[#f12711]">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-[#333] m-0 text-xl font-bold flex-1 mr-4 leading-snug">{quiz.title}</h3>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${quiz.active ? 'bg-[#e8f5e9] text-[#4CAF50]' : 'bg-[#fff3e0] text-[#ff9800]'}`}>{quiz.active ? 'Active' : 'Inactive'}</div>
                </div>
                <div className="mb-6">
                  <p className="text-[#666] text-sm mb-4 leading-snug">{quiz.description || 'No description provided'}</p>
                  <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex items-center gap-2 text-[#777] text-sm"><span>{quiz.questions?.length || 0} Questions</span></div>
                    <div className="flex items-center gap-2 text-[#777] text-sm"><span>{quiz.totalPoints || 0} Points</span></div>
                    <div className="flex items-center gap-2 text-[#777] text-sm"><span>{formatDate(quiz.createdAt)}</span></div>
                  </div>
                  <div className="bg-[#fff8f5] border border-[#f5af19] rounded-lg p-3 flex justify-between items-center">
                    <span className="text-[#666] text-sm">Quiz Code:</span>
                    <span className="font-mono font-bold text-[#e85a19] text-lg tracking-wide">{quiz.code}</span>
                    <button onClick={() => handleCopyCode(quiz.code)} className="bg-none border-none text-[#aaa] cursor-pointer text-base transition-colors hover:text-[#333]"><FaCopy /></button>
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t border-[#eee]">
                  <Btn onClick={() => { setSelectedQuiz(quiz); setShowDetailsModal(true); }} cls="bg-[#3f51b5] text-white" title="View Details"><FaEye /></Btn>
                  <Btn onClick={() => navigate(`/teacher/edit-quiz/${quiz.id}`)} cls="bg-[#03a9f4] text-white" title="Edit Quiz"><FaPen /></Btn>
                  <Btn onClick={() => navigate(`/teacher/results/${quiz.id}`)} cls="bg-[#00bcd4] text-white" title="View Results"><FaChartBar /></Btn>
                  <Btn onClick={() => navigate(`/teacher/grading/${quiz.id}`)} cls="bg-[#ffc107] text-[#333]" title="Grade Submissions"><FaMarker /></Btn>
                  <Btn onClick={() => handleToggleActive(quiz)} cls={quiz.active ? 'bg-[#ff9800] text-white' : 'bg-[#4CAF50] text-white'} title={quiz.active ? 'Deactivate' : 'Activate'}><i className={`fas ${quiz.active ? 'fa-pause' : 'fa-play'}`}/></Btn>
                  <Btn onClick={() => { setQuizToDelete(quiz); setShowDeleteModal(true); }} cls="bg-[#f44336] text-white" title="Delete Quiz"><FaTrash /></Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedQuiz && (
        <Modal onClose={() => setShowDetailsModal(false)} wide>
          <div className="flex justify-between items-center px-8 py-6 border-b border-[#eee] sticky top-0 bg-white z-10">
            <h2 className="text-[#333] m-0 text-2xl font-semibold">{selectedQuiz.title}</h2>
            <button onClick={() => setShowDetailsModal(false)} className="bg-[#f0f0f0] border-none text-[#555] cursor-pointer p-1 rounded-full w-8 h-8 flex items-center justify-center transition-all hover:bg-[#e0e0e0] hover:rotate-90"><FaTimes /></button>
          </div>
          <div className="p-8">
            <div className="mb-8">
              <h3 className="text-[#333] mt-0 mb-6 text-xl font-semibold border-b border-[#eee] pb-3">Quiz Overview</h3>
              <p className="text-[#666] mb-4">{selectedQuiz.description || 'No description provided.'}</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Questions', value: selectedQuiz.questions?.length || 0 },
                  { label: 'Total Points', value: selectedQuiz.totalPoints || 'N/A' },
                  { label: 'Status', value: selectedQuiz.active ? 'Active' : 'Inactive', color: selectedQuiz.active ? 'text-[#4CAF50]' : 'text-[#ff9800]' },
                  { label: 'Quiz Code', value: selectedQuiz.code, mono: true },
                ].map(({ label, value, color, mono }) => (
                  <div key={label}><span className="font-semibold text-[#777] text-sm">{label}:</span><span className={`block font-medium ${color || 'text-[#333]'} ${mono ? 'font-mono bg-[#fff8f5] px-2 py-0.5 rounded border border-[#f5af19] text-[#e85a19] font-bold' : ''}`}>{value}</span></div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-[#333] mt-0 mb-6 text-lg font-semibold border-b border-[#eee] pb-3">Questions Preview</h4>
              <div className="flex flex-col gap-6">
                {selectedQuiz.questions?.map((q, i) => <QuestionDetailsPreview key={q.id || i} question={q} index={i} />)}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      {showDeleteModal && quizToDelete && (
        <Modal onClose={() => setShowDeleteModal(false)}>
          <div className="flex justify-between items-center px-8 py-6 border-b border-[#eee]">
            <h2 className="text-[#333] m-0 text-2xl font-semibold">Delete Quiz</h2>
            <button onClick={() => setShowDeleteModal(false)} className="bg-[#f0f0f0] border-none text-[#555] cursor-pointer p-1 rounded-full w-8 h-8 flex items-center justify-center transition-all hover:bg-[#e0e0e0]"><FaTimes /></button>
          </div>
          <div className="p-8">
            <div className="text-center pb-8">
              <i className="fas fa-exclamation-triangle text-[3rem] text-[#ff9800] mb-4 block"/>
              <p className="mb-2 text-[#333] text-lg">Are you sure you want to delete <strong>"{quizToDelete.title}"</strong>?</p>
              <p className="text-[#666] text-sm italic">This action cannot be undone.</p>
            </div>
            <div className="flex gap-4 justify-end pt-4 border-t border-[#eee]">
              <button onClick={() => setShowDeleteModal(false)} className="bg-[#f5f5f5] text-[#666] border border-[#ddd] rounded-lg px-6 py-3 font-bold cursor-pointer transition-all hover:bg-[#e0e0e0] hover:text-[#333] text-base">Cancel</button>
              <button onClick={handleDeleteQuiz} className="bg-[#f44336] text-white border-none rounded-lg px-6 py-3 font-bold cursor-pointer transition-all hover:bg-[#d32f2f] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(244,67,54,0.3)] text-base">Delete Quiz</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default YourQuizzes;

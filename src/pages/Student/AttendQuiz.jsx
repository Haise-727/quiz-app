import React, { useState, useEffect } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const AttendQuiz = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  const user = auth.currentUser;

  const [quizCode, setQuizCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableQuizzes, setAvailableQuizzes] = useState([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'quizzes'), where('active', '==', true)));
        setAvailableQuizzes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error fetching quizzes:', e);
      } finally {
        setLoadingQuizzes(false);
      }
    };
    fetch();
  }, []);

  const handleSignOut = () => signOut(auth).then(() => navigate('/login')).catch(console.error);

  const handleJoinQuiz = async () => {
    if (!quizCode.trim()) { setError('Please enter a quiz code.'); return; }
    setError('');
    setIsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'quizzes'), where('code', '==', quizCode.toUpperCase()), where('active', '==', true))
      );
      if (snap.empty) { setError('No active quiz found with this code. Please check and try again.'); return; }
      navigate(`/student/quiz/${snap.docs[0].id}`);
    } catch {
      setError('Failed to join quiz. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return 'Unknown date';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Invalid date'; }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen w-screen bg-gradient-to-br from-[#3a1c71] to-[#4776e6] text-white p-8 overflow-hidden">

      <button onClick={handleSignOut} className="absolute top-5 right-5 bg-white/20 text-white border-none rounded-full px-5 py-2.5 font-bold cursor-pointer transition-all hover:bg-red-500 hover:-translate-y-0.5 z-10">
        Sign Out
      </button>
      <button onClick={() => navigate('/student/dashboard')} className="absolute top-5 left-5 flex items-center gap-2 bg-white/20 text-white border-none rounded-full px-5 py-2.5 font-bold cursor-pointer transition-all hover:bg-white/30 hover:-translate-y-0.5 z-10">
        <i className="fas fa-arrow-left text-[0.9em]" /> Back to Dashboard
      </button>

      <div className="flex flex-col items-center gap-4 w-[90vw] max-w-[700px] p-8 rounded-2xl bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.2)] animate-fade-in">
        <h1 className="text-3xl font-bold">Ready to Quiz?</h1>
        <p className="text-[#ddd] text-[1.1rem] mb-4 text-center">Welcome, {user?.email || 'Student'}</p>

        {/* Code input card */}
        <div className="w-full max-w-[500px] text-center mt-4">
          <h2 className="text-[1.5rem] font-semibold text-[#e0e0e0] mb-6">Join a Quiz</h2>
          <div className="flex bg-black/20 rounded-xl overflow-hidden border border-white/10 shadow-[0_4px_15px_rgba(0,0,0,0.2)] transition-all duration-300 focus-within:border-white/40 mt-4">
            <input
              type="text"
              placeholder="Enter Quiz Code"
              value={quizCode}
              onChange={(e) => setQuizCode(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinQuiz()}
              maxLength={6}
              className="flex-1 bg-transparent border-none px-4 py-4 text-base text-white placeholder-white/50 outline-none"
            />
            <button
              onClick={handleJoinQuiz}
              disabled={isLoading}
              className="bg-gradient-to-r from-[#fdfbfb] to-[#ebedee] text-[#333] border-none px-6 font-bold text-base cursor-pointer transition-all duration-300 hover:from-white hover:to-[#f0f2f3] hover:text-black disabled:bg-[#555] disabled:text-[#999] disabled:cursor-not-allowed"
            >
              {isLoading ? 'Joining...' : 'Join Now'}
            </button>
          </div>
          {error && <div className="text-[#ffbaba] bg-[rgba(255,82,82,0.2)] border border-[rgba(255,82,82,0.5)] px-3 py-3 rounded-lg mt-6 font-medium animate-fade-in">{error}</div>}
        </div>

        {/* Available quizzes card */}
        <div className="bg-white text-[#333] rounded-xl p-8 w-full shadow-[0_5px_15px_rgba(0,0,0,0.1)] mt-6 animate-fade-in">
          <h2 className="text-[1.8rem] mb-5 text-center">Available Quizzes</h2>

          {loadingQuizzes ? (
            <div className="flex flex-col items-center gap-4 py-8 text-[#666]">
              <div className="w-10 h-10 border-4 border-[#e3f2fd] border-t-[#4b70e2] rounded-full animate-spin" />
              <p>Loading available quizzes...</p>
            </div>
          ) : availableQuizzes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6 mt-6">
              {availableQuizzes.map((quiz, i) => (
                <div
                  key={quiz.id}
                  className="bg-gradient-to-br from-[#f8fbff] to-[#e3f2fd] rounded-xl p-6 shadow-[0_4px_12px_rgba(75,112,226,0.1)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_8px_25px_rgba(75,112,226,0.2)] border border-[rgba(75,112,226,0.1)] relative overflow-hidden opacity-0 translate-y-5 animate-slide-in-up"
                  style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                >
                  {/* Top accent bar on hover */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#4b70e2] to-[#64b5f6] scale-x-0 transition-transform duration-300 group-hover:scale-x-100" />

                  <div className="flex justify-between items-start mb-4 gap-4">
                    <h3 className="text-[#1a237e] m-0 text-[1.25rem] font-semibold flex-1 leading-snug">{quiz.title}</h3>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gradient-to-br from-[#e8f5e8] to-[#c8e6c9] text-[#2e7d32] animate-pulse-opacity">
                      <i className="fas fa-circle text-[0.6rem] animate-blink" /> Active
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-[#546e7a] text-[0.9rem] mb-5 leading-relaxed line-clamp-2">
                      {quiz.description || 'No description provided'}
                    </p>
                    <div className="flex flex-wrap gap-4 mb-5">
                      {[
                        { icon: 'fa-question-circle', text: `${quiz.questions?.length || 0} Questions` },
                        { icon: 'fa-clock', text: `${Math.floor((quiz.timeLimit || 60) / 60)}:${((quiz.timeLimit || 60) % 60).toString().padStart(2,'0')} mins` },
                        { icon: 'fa-calendar', text: formatDate(quiz.createdAt) },
                      ].map(({ icon, text }) => (
                        <div key={text} className="flex items-center gap-2 text-[#607d8b] text-[0.85rem] font-medium">
                          <i className={`fas ${icon} text-[#4b70e2] text-[0.9rem]`} />
                          <span>{text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-gradient-to-br from-white to-[#f5f8ff] border-2 border-dashed border-[#4b70e2] rounded-lg p-3 flex justify-between items-center">
                      <span className="text-[#607d8b] text-[0.85rem] font-medium">Quiz Code:</span>
                      <span className="font-mono font-bold text-[#4b70e2] text-[1.1rem] tracking-wide px-2 py-0.5 bg-[rgba(75,112,226,0.1)] rounded">{quiz.code}</span>
                    </div>
                  </div>

                  <div className="flex justify-center pt-4 border-t border-[rgba(75,112,226,0.1)]">
                    <button
                      onClick={() => navigate(`/student/quiz/${quiz.id}`)}
                      className="bg-gradient-to-br from-[#4b70e2] to-[#64b5f6] text-white border-none rounded-full px-8 py-3 font-semibold cursor-pointer transition-all duration-300 flex items-center gap-2 text-[0.95rem] shadow-[0_2px_8px_rgba(75,112,226,0.3)] hover:from-[#3a5cc1] hover:to-[#42a5f5] hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(75,112,226,0.4)]"
                    >
                      <i className="fas fa-play text-[0.9rem]" /> Take Quiz
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 px-8 text-[#607d8b]">
              <div className="text-[3.5rem] text-[#4b70e2] mb-4 animate-float">
                <i className="fas fa-clipboard-list" />
              </div>
              <h3 className="text-[#1a237e] mb-3 text-[1.5rem] font-semibold">No Quizzes Available</h3>
              <p className="m-0 text-base opacity-80">Check back later for new quizzes!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendQuiz;

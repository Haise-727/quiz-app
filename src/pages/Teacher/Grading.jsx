import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import MediaRenderer from '../../components/MediaRenderer';
import { Button } from '@/components/ui/button';
import { createNotification } from '../../utils/notifications';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, CheckCircle2, Clock, UserCircle, LogOut, GraduationCap,
  Save, Loader2, ClipboardCheck, AlertCircle, User,
} from 'lucide-react';

// ── Single answer block inside grading modal ──────────────────────────────────
const AnswerBlock = ({ originalQuestion, answer, onPointsChange, isGraded }) => {
  const renderUserAnswer = () => {
    const ua = answer.userAnswer;
    if ((!ua && typeof ua !== 'string') || (Array.isArray(ua) && ua.length === 0))
      return <span className="italic text-[hsl(var(--muted-foreground))]">No answer provided.</span>;
    switch (originalQuestion.type) {
      case 'MCQ':
        return (
          <ul className="flex flex-col gap-1">
            {originalQuestion.mcqData.options.filter(o => ua.includes(o.id)).map(o => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <MediaRenderer media={o.media} transform="thumbnail" />
                {o.text || 'Media Answer'}
              </li>
            ))}
          </ul>
        );
      case 'FILL_IN_THE_BLANK': case 'PARAGRAPH':
        return <p className="whitespace-pre-wrap text-sm m-0">{ua}</p>;
      case 'REORDER':
        return (
          <ol className="flex flex-col gap-1">
            {ua.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="text-[hsl(var(--muted-foreground))]">{i + 1}.</span>
                <MediaRenderer media={item.media} transform="thumbnail" />{item.text}
              </li>
            ))}
          </ol>
        );
      case 'CATEGORIZE':
        return (
          <div className="flex flex-col gap-2">
            {originalQuestion.categorizeData.categories.map(cat => (
              <div key={cat.id}>
                <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mb-1">{cat.name}:</p>
                {(ua[cat.id] || []).map(i => (
                  <div key={i.id} className="flex items-center gap-1 text-sm pl-2">
                    <MediaRenderer media={i.media} transform="thumbnail" />{i.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      case 'MATCH_THE_FOLLOWING':
        return (
          <div className="flex flex-col gap-1">
            {originalQuestion.matchData.pairs.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm flex-wrap">
                <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  <MediaRenderer media={p.promptMedia} transform="thumbnail" />{p.prompt}
                </div>
                <span className="text-[hsl(var(--muted-foreground))]">→</span>
                <div className="flex items-center gap-1 bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  {ua.pairs?.[p.id]
                    ? <><MediaRenderer media={ua.pairs[p.id].answerMedia} transform="thumbnail" />{ua.pairs[p.id].answerText}</>
                    : <span className="italic text-[hsl(var(--muted-foreground))]">unmatched</span>}
                </div>
              </div>
            ))}
          </div>
        );
      default: return <span className="italic text-[hsl(var(--muted-foreground))]">Review unavailable.</span>;
    }
  };

  return (
    <div className="border border-[hsl(var(--border))] rounded-xl p-4 bg-[hsl(var(--card))]">
      <p className="font-semibold text-sm text-[hsl(var(--foreground))] mb-4 leading-relaxed">
        {answer.questionIndex + 1}. {originalQuestion.questionText}
      </p>

      {originalQuestion.paragraphData?.keywords?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-1.5">Grading Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {originalQuestion.paragraphData.keywords.map((kw, i) => (
              <span key={i} className="bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] px-2 py-0.5 rounded-full text-xs">{kw.text}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-col sm:flex-row">
        <div className="flex-1">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2">Student's Answer</p>
          <div className="bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] rounded-lg p-3 min-h-[60px] text-sm text-[hsl(var(--foreground))]">
            {renderUserAnswer()}
          </div>
        </div>

        <div className="sm:w-36 shrink-0">
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-2 text-center">Points</p>
          <div className={`flex items-center border-2 rounded-xl overflow-hidden transition-colors ${!isGraded ? 'border-[hsl(var(--primary))] focus-within:ring-2 focus-within:ring-[hsl(var(--primary))]/20' : 'border-[hsl(var(--border))]'}`}>
            <input
              type="number"
              value={answer.pointsAwarded === null || answer.pointsAwarded === undefined ? '' : answer.pointsAwarded}
              onChange={e => onPointsChange(e.target.value)}
              max={originalQuestion.points}
              min="0"
              disabled={isGraded}
              className="w-full border-none bg-transparent outline-none p-2 text-2xl font-black text-center text-[hsl(var(--primary))] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:text-[hsl(var(--muted-foreground))]"
            />
            <span className="text-sm font-medium text-[hsl(var(--muted-foreground))] pr-3 shrink-0">/{originalQuestion.points}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Grading = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { currentUser, displayName, signOut: ctxSignOut, switchRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [quizDetails, setQuizDetails] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const [selectedSub, setSelectedSub] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true); setError('');
    try {
      const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
      if (!quizSnap.exists() || quizSnap.data().createdBy !== currentUser.uid) {
        setError("Quiz not found or you don't have permission."); setLoading(false); return;
      }
      setQuizDetails(quizSnap.data());

      const subsSnap = await getDocs(query(collection(db, 'quiz_results'), where('quizId', '==', quizId)));
      const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const userIds = [...new Set(subs.map(s => s.userId).filter(id => !id.startsWith('guest_')))];
      const names = {};
      if (userIds.length) {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('__name__', 'in', userIds)));
        usersSnap.forEach(d => { names[d.id] = d.data().displayName || d.data().email; });
      }

      const enriched = subs.map(s => ({
        ...s,
        userName: s.userId.startsWith('guest_')
          ? (s.username || 'Guest')
          : (names[s.userId] || 'Unknown Student'),
        isGuest: s.userId.startsWith('guest_'),
      }));
      enriched.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        return (b.completedAt?.toDate?.() || 0) - (a.completedAt?.toDate?.() || 0);
      });
      setSubmissions(enriched);
    } catch (err) { setError('Failed to load submissions.'); console.error(err); }
    finally { setLoading(false); }
  }, [quizId, currentUser]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openModal = (sub) => {
    setSelectedSub({ ...sub, answers: sub.answers.map((a, i) => ({ ...a, questionIndex: i })) });
  };

  const handlePointsChange = (qi, pts) => {
    const val = pts === '' ? null : parseInt(pts, 10);
    const max = quizDetails.questions[qi].points;
    setSelectedSub(cur => ({
      ...cur,
      answers: cur.answers.map((a, i) =>
        i === qi ? { ...a, pointsAwarded: val === null ? null : (!isNaN(val) && val >= 0 && val <= max ? val : a.pointsAwarded) } : a
      ),
    }));
  };

  const handleSave = async () => {
    if (!selectedSub) return;
    setSaving(true);
    const total = selectedSub.answers.reduce((s, a) => s + (a.pointsAwarded || 0), 0);
    const updatedAnswers = selectedSub.answers.map(a => ({ ...a, status: 'manually_graded', pointsAwarded: a.pointsAwarded ?? 0 }));
    try {
      await updateDoc(doc(db, 'quiz_results', selectedSub.id), {
        score: total, finalScore: total + (selectedSub.bonus || 0), answers: updatedAnswers, status: 'completed',
      });
      toast.success('Grade saved!');

      // Notify the student
      if (selectedSub.userId && !selectedSub.userId.startsWith('guest_')) {
        try {
          await createNotification(
            selectedSub.userId,
            `Your quiz "${quizDetails.title}" has been graded! Final Score: ${total + (selectedSub.bonus || 0)}/${selectedSub.maxScore}`,
            'grade_released',
            { quizId, resultId: selectedSub.id }
          );
        } catch (notifErr) {
          console.error("Error creating grade released notification:", notifErr);
        }
      }

      setSelectedSub(null);
      fetchAll();
    } catch (err) { toast.error('Could not save grade.'); console.error(err); }
    finally { setSaving(false); }
  };

  const handleSignOut = async () => { await ctxSignOut(); navigate('/login'); };
  const handleSwitchRole = async () => { try { await switchRole('student'); toast.success('Switched to Student'); } catch { toast.error('Failed.'); } };

  const initials = displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'T';
  const pendingCount = submissions.filter(s => s.status === 'pending').length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="w-full relative">
      {/* Hero / Page Title */}
      <div className="pb-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-black text-[hsl(var(--foreground))]">
            Grading: {quizDetails?.title || '…'}
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            {pendingCount > 0 && <span className="ml-2 font-bold text-amber-500">· {pendingCount} pending review</span>}
          </p>
        </motion.div>
      </div>

      {/* Main */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mb-10 rounded-[12px] bg-[hsl(var(--card))] overflow-hidden border border-[hsl(var(--border))]"
      >
        <div className="p-6 md:p-8">

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                <ClipboardCheck className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="font-semibold text-[hsl(var(--foreground))]">No submissions yet</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Students haven't submitted this quiz yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Pending header */}
              {pendingCount > 0 && (
                <>
                  <div className="flex items-center gap-2 text-amber-700 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-bold">Needs Review ({pendingCount})</span>
                  </div>
                  {submissions.filter(s => s.status === 'pending').map((sub, i) => (
                    <SubmissionRow key={sub.id} sub={sub} index={i} onGrade={openModal} />
                  ))}
                  {submissions.some(s => s.status === 'completed') && (
                    <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))] mt-2 mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-bold">Completed ({submissions.filter(s => s.status === 'completed').length})</span>
                    </div>
                  )}
                  {submissions.filter(s => s.status === 'completed').map((sub, i) => (
                    <SubmissionRow key={sub.id} sub={sub} index={i} onGrade={openModal} />
                  ))}
                </>
              )}
              {pendingCount === 0 && submissions.map((sub, i) => (
                <SubmissionRow key={sub.id} sub={sub} index={i} onGrade={openModal} />
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Grading Dialog */}
      <Dialog open={!!selectedSub} onOpenChange={open => { if (!open) setSelectedSub(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0 pb-4 border-b border-[hsl(var(--border))]">
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-[hsl(var(--primary))]" />
              {selectedSub?.userName}
              {selectedSub?.isGuest && <Badge variant="outline" className="text-xs">Guest</Badge>}
            </DialogTitle>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant={selectedSub?.status === 'completed' ? 'success' : 'warning'}>
                {selectedSub?.status === 'completed' ? 'Completed' : 'Pending Review'}
              </Badge>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                Auto-graded: {selectedSub?.score}/{selectedSub?.maxScore} pts
              </span>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 pt-4 flex flex-col gap-4">
            {quizDetails?.questions.map((q, i) => (
              <AnswerBlock
                key={q.id || i}
                originalQuestion={q}
                answer={selectedSub?.answers[i]}
                onPointsChange={pts => handlePointsChange(i, pts)}
                isGraded={selectedSub?.status === 'completed'}
              />
            ))}
          </div>

          {selectedSub?.status !== 'completed' && (
            <DialogFooter className="shrink-0 pt-4 border-t border-[hsl(var(--border))] gap-2">
              <Button variant="outline" onClick={() => setSelectedSub(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="gap-2 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))]">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Grade</>}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Submission row component ──────────────────────────────────────────────────
const SubmissionRow = ({ sub, index, onGrade }) => {
  const pct = sub.maxScore > 0 ? Math.round(((sub.status === 'completed' ? sub.finalScore : sub.score) / sub.maxScore) * 100) : 0;
  const pending = sub.status === 'pending';

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}>
      <Card className={`border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm hover:shadow-md transition-all border-l-4 ${pending ? 'border-l-amber-400' : 'border-l-green-500'}`}>
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${pending ? 'bg-amber-400' : 'bg-green-500'}`}>
                {sub.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-[hsl(var(--foreground))] truncate">{sub.userName}</p>
                  {sub.isGuest && <Badge variant="outline" className="text-xs shrink-0">Guest</Badge>}
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {sub.completedAt?.toDate?.().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—'}
                </p>
              </div>
            </div>

            <div className="text-center shrink-0">
              <p className="text-xl font-black text-[hsl(var(--primary))]">
                {sub.status === 'completed' ? `${sub.finalScore}` : `${sub.score}`}
                <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">/{sub.maxScore}</span>
              </p>
              {sub.status === 'completed' && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{pct}%</p>
              )}
            </div>

            <Badge variant={pending ? 'warning' : 'success'} className="shrink-0">
              {pending ? 'Pending' : 'Graded'}
            </Badge>

            <Button size="sm" onClick={() => onGrade(sub)} className={`shrink-0 gap-1.5 ${pending ? 'bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))]' : ''}`}
              variant={pending ? 'default' : 'outline'}>
              {pending ? 'Grade Now' : 'View Graded'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default Grading;

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  createClass, getTeacherClasses, updateClass, deleteClass,
  addQuizToClass, removeQuizFromClass, getClassEnrollments,
} from '../../utils/classHelpers';
import {
  ArrowLeft, Plus, Users, BookOpen, Hash, Trash2, Edit2,
  Copy, Check, ChevronDown, ChevronUp, Loader2, GraduationCap,
} from 'lucide-react';

// ── Sub-components ────────────────────────────────────────────────────────────

const FormInput = ({ label, value, onChange, placeholder, as: Tag = 'input', rows, required }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-sm font-semibold text-[hsl(var(--foreground))]">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <Tag
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="px-3 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 text-[hsl(var(--foreground))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/40 focus:border-[hsl(var(--primary))] placeholder:text-[hsl(var(--muted-foreground))] resize-none transition"
    />
  </div>
);

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={copy} title="Copy code"
      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const Classes = () => {
  const navigate  = useNavigate();
  const { currentUser, displayName } = useAuth();

  const [classes,   setClasses]   = useState([]);
  const [quizzes,   setQuizzes]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState({}); // classId → bool

  // Create/Edit modal
  const [modal, setModal]   = useState({ open: false, mode: 'create', cls: null });
  const [form,  setForm]    = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  // Assign quiz modal
  const [assignModal, setAssignModal] = useState({ open: false, cls: null });

  // Enrollments cache: classId → [enrollment]
  const [enrollments, setEnrollments] = useState({});

  // ── Fetch ──

  const loadClasses = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [cls, qSnap] = await Promise.all([
        getTeacherClasses(currentUser.uid),
        getDocs(query(collection(db, 'quizzes'), where('createdBy', '==', currentUser.uid))),
      ]);
      setClasses(cls.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      setQuizzes(qSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const loadEnrollments = async (classId) => {
    if (enrollments[classId]) return; // cached
    try {
      const list = await getClassEnrollments(classId);
      setEnrollments(prev => ({ ...prev, [classId]: list }));
    } catch {
      toast.error('Could not load student list.');
    }
  };

  // ── Toggle expand ──

  const toggleExpand = (classId) => {
    setExpanded(prev => {
      const next = { ...prev, [classId]: !prev[classId] };
      if (next[classId]) loadEnrollments(classId);
      return next;
    });
  };

  // ── Create / Edit class ──

  const openCreate = () => {
    setForm({ name: '', description: '' });
    setModal({ open: true, mode: 'create', cls: null });
  };

  const openEdit = (cls) => {
    setForm({ name: cls.name, description: cls.description || '' });
    setModal({ open: true, mode: 'edit', cls });
  };

  const handleSaveClass = async () => {
    if (!form.name.trim()) { toast.error('Class name is required.'); return; }
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await createClass({
          name: form.name.trim(),
          description: form.description.trim(),
          teacherId: currentUser.uid,
          teacherName: displayName || 'Teacher',
        });
        toast.success('Class created!');
      } else {
        await updateClass(modal.cls.id, { name: form.name.trim(), description: form.description.trim() });
        toast.success('Class updated!');
      }
      setModal({ open: false, mode: 'create', cls: null });
      loadClasses();
    } catch (err) {
      toast.error(err.message || 'Failed to save class.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete class ──

  const handleDelete = async (cls) => {
    if (!window.confirm(`Delete "${cls.name}"? This will remove all enrollments.`)) return;
    try {
      await deleteClass(cls.id);
      toast.success('Class deleted.');
      loadClasses();
    } catch {
      toast.error('Failed to delete class.');
    }
  };

  // ── Assign / remove quiz ──

  const handleToggleQuiz = async (classId, quizId, currentIds) => {
    try {
      if (currentIds.includes(quizId)) {
        await removeQuizFromClass(classId, quizId);
        toast.success('Quiz removed from class.');
      } else {
        await addQuizToClass(classId, quizId);
        toast.success('Quiz assigned to class!');
      }
      loadClasses();
    } catch {
      toast.error('Failed to update quiz assignment.');
    }
  };

  // ── Render ──

  return (
    <div className="min-h-screen w-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] relative overflow-x-hidden">
      {/* Decorative background grid and blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[linear-gradient(to_right,hsl(var(--foreground))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--foreground))_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[hsl(var(--primary))]/5 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center text-white font-black text-sm">Q</div>
          <span className="text-[hsl(var(--foreground))] font-bold text-lg tracking-tight hidden sm:block">Quizlike</span>
        </div>
        <button
          onClick={() => navigate('/teacher/home')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted))]/80 text-[hsl(var(--foreground))] text-sm font-semibold transition-colors border border-[hsl(var(--border))]"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
      </header>

      {/* Hero */}
      <div className="relative z-10 px-6 md:px-10 py-8">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl md:text-4xl font-black text-[hsl(var(--foreground))]">My Classes</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-base">Create classes, assign quizzes, and manage enrollments.</p>
        </motion.div>
      </div>

      {/* Main card */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3, delay: 0.05 }}
        className="relative z-10 mx-4 md:mx-10 mb-10 rounded-2xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] shadow-sm overflow-hidden"
      >
        <div className="p-6 md:p-8">

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {classes.length} Class{classes.length !== 1 ? 'es' : ''}
            </h2>
            <Button
              onClick={openCreate}
              className="gap-2 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))] shadow"
            >
              <Plus className="w-4 h-4" /> New Class
            </Button>
          </div>

          {/* Class list */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-[hsl(var(--border))] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
            </div>
          ) : classes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
                <GraduationCap className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
              </div>
              <p className="font-semibold text-[hsl(var(--foreground))]">No classes yet</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Click "New Class" to get started.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {classes.map((cls, i) => (
                  <motion.div
                    key={cls.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="border border-[hsl(var(--border))] shadow-sm overflow-hidden bg-[hsl(var(--card))]">
                      {/* Accent bar */}
                      <div className="h-1 bg-[hsl(var(--primary))]" />
                      <CardContent className="pt-4 pb-4">

                        {/* Class summary row */}
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[hsl(var(--foreground))] truncate">{cls.name}</p>
                            {cls.description && (
                              <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">{cls.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {/* Invite code pill */}
                              <div className="inline-flex items-center gap-1 bg-[hsl(var(--muted))] rounded-lg px-2.5 py-1 border border-[hsl(var(--border))]">
                                <Hash className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                                <span className="font-mono font-bold text-[hsl(var(--primary))] tracking-widest text-sm">{cls.code}</span>
                                <CopyButton text={cls.code} />
                              </div>
                              <span className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5" /> {cls.quizIds?.length || 0} quiz{cls.quizIds?.length !== 1 ? 'zes' : ''}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline"
                              onClick={() => setAssignModal({ open: true, cls })}
                              className="gap-1.5 text-xs border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50">
                              <BookOpen className="w-3.5 h-3.5" /> Assign Quizzes
                            </Button>
                            <Button size="sm" variant="outline"
                              onClick={() => openEdit(cls)}
                              className="gap-1.5 text-xs border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="outline"
                              onClick={() => handleDelete(cls)}
                              className="text-xs border-[hsl(var(--border))] hover:border-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost"
                              onClick={() => toggleExpand(cls.id)}
                              className="gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                              <Users className="w-3.5 h-3.5" />
                              {expanded[cls.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {/* Expanded: student roster */}
                        <AnimatePresence>
                          {expanded[cls.id] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
                                <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-3">
                                  Enrolled Students ({enrollments[cls.id]?.length ?? '…'})
                                </p>
                                {!enrollments[cls.id] ? (
                                  <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                                  </div>
                                ) : enrollments[cls.id].length === 0 ? (
                                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No students enrolled yet.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {enrollments[cls.id].map(e => (
                                      <Badge key={e.id} variant="secondary" className="gap-1 font-normal">
                                        <GraduationCap className="w-3 h-3" /> {e.studentName}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Create / Edit Modal ── */}
      <Dialog open={modal.open} onOpenChange={v => setModal(m => ({ ...m, open: v }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.mode === 'create' ? 'Create New Class' : 'Edit Class'}</DialogTitle>
            <DialogDescription>
              {modal.mode === 'create'
                ? 'Students will use the generated invite code to join.'
                : 'Update the class name or description.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <FormInput
              label="Class Name" required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Grade 10 — Mathematics"
            />
            <FormInput
              label="Description" as="textarea" rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional short description for students"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</Button>
            <Button
              disabled={saving}
              onClick={handleSaveClass}
              className="gap-2 bg-[hsl(var(--primary))] text-white border-0 hover:bg-[hsl(var(--primary-hover))]"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {modal.mode === 'create' ? 'Create Class' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Quizzes Modal ── */}
      <Dialog open={assignModal.open} onOpenChange={v => setAssignModal(m => ({ ...m, open: v }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Quizzes — {assignModal.cls?.name}</DialogTitle>
            <DialogDescription>Toggle quizzes on/off to control what students in this class can access.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4 max-h-80 overflow-y-auto pr-1">
            {quizzes.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-4">
                No quizzes found. Create a quiz first.
              </p>
            ) : quizzes.map(quiz => {
              const assigned = (assignModal.cls?.quizIds || []).includes(quiz.id);
              return (
                <button
                  key={quiz.id}
                  onClick={() => {
                    handleToggleQuiz(assignModal.cls.id, quiz.id, assignModal.cls?.quizIds || []);
                    // Optimistically update local assignModal.cls
                    setAssignModal(prev => {
                      const ids = prev.cls.quizIds || [];
                      const nextIds = assigned ? ids.filter(id => id !== quiz.id) : [...ids, quiz.id];
                      return { ...prev, cls: { ...prev.cls, quizIds: nextIds } };
                    });
                  }}
                  className={[
                    'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-150',
                    assigned
                      ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/5 text-[hsl(var(--foreground))]'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--foreground))]'
                  ].join(' ')}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${assigned ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]' : 'border-[hsl(var(--border))]'}`}>
                    {assigned && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{quiz.title}</p>
                    <p className="text-xs truncate opacity-60">{quiz.questions?.length || 0} questions · {quiz.totalPoints || 0} pts</p>
                  </div>
                  {assigned && <Badge className="shrink-0 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20 text-[10px]">Assigned</Badge>}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setAssignModal(m => ({ ...m, open: false }))}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Classes;

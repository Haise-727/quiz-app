import React, { useState, useEffect, useCallback, useId } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import PageHeader from '@/components/layout/PageHeader';
import Skeleton from '@/components/teacher/Skeleton';
import CopyCodeButton from '@/components/teacher/CopyCodeButton';
import { rise, spring, stagger } from '@/lib/motion';
import {
  createClass, getTeacherClasses, updateClass, deleteClass,
  addQuizToClass, removeQuizFromClass, getClassEnrollments, setQuizDueDate,
} from '../../api/classes';
import { getDueStatus, formatDueDate } from '../../utils/assignmentHelpers';
import { getCompletionCount } from '../../api/results';
import { listMyQuizzesUnordered } from '../../api/quizzes';
import {
  PiPlusBold, PiBookOpenBold, PiTrashBold, PiPencilSimpleBold, PiCheckBold, PiCaretDownBold,
  PiSpinnerGapBold, PiCalendarBlankBold, PiXBold, PiUsersBold,
} from 'react-icons/pi';

// ── Sub-components ────────────────────────────────────────────────────────────

const fieldClass = 'w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ink))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] resize-none';

const FormInput = ({ label, value, onChange, placeholder, as: Tag = 'input', rows, required }) => {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[hsl(var(--foreground))]">
        {label}{required && <span className="ml-0.5 text-[hsl(var(--destructive))]" aria-hidden="true">*</span>}
      </label>
      <Tag id={id} value={value} onChange={onChange} placeholder={placeholder} rows={rows} required={required} className={fieldClass} />
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const Classes = () => {
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

  // Completion counts cache: classId → { quizId: completedCount }
  const [completions, setCompletions] = useState({});

  // ── Fetch ──

  const loadClasses = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [cls, myQuizzes] = await Promise.all([
        getTeacherClasses(currentUser.uid),
        listMyQuizzesUnordered(currentUser.uid),
      ]);
      setClasses(cls.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      setQuizzes(myQuizzes);
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

      const cls = classes.find(c => c.id === classId);
      const quizIds = cls?.quizIds || [];
      const studentIds = list.map(e => e.studentId);
      if (quizIds.length && studentIds.length) {
        const counts = {};
        await Promise.all(quizIds.map(async qId => {
          counts[qId] = await getCompletionCount(qId, studentIds, currentUser.uid);
        }));
        setCompletions(prev => ({ ...prev, [classId]: counts }));
      }
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
        toast.success('Class created.');
      } else {
        await updateClass(modal.cls.id, { name: form.name.trim(), description: form.description.trim() });
        toast.success('Class updated.');
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
        toast.success('Quiz assigned to class.');
      }
      loadClasses();
    } catch {
      toast.error('Failed to update quiz assignment.');
    }
  };

  // ── Render ──

  return (
    <div className="mx-auto w-full max-w-5xl pb-16">
      <PageHeader
        eyebrow="Teacher"
        title="Classes"
        description="Create classes, assign quizzes and see who has joined."
        actions={<Button onClick={openCreate}><PiPlusBold /> New class</Button>}
      />

      <section aria-label="Your classes" className="mt-10">
        {loading ? (
          <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : classes.length === 0 ? (
          <motion.div variants={rise} initial="hidden" animate="show" className="border-t border-[hsl(var(--border))] pt-8">
            <p className="text-lg font-medium">No classes yet.</p>
            <p className="mt-1 text-[hsl(var(--muted-foreground))]">Create a class and share its invite code with your students.</p>
            <Button className="mt-5" size="lg" onClick={openCreate}><PiPlusBold /> New class</Button>
          </motion.div>
        ) : (
          <>
            <p className="eyebrow tabular mb-2">{classes.length} {classes.length === 1 ? 'class' : 'classes'}</p>
            <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
              <AnimatePresence>
                {classes.map((cls) => {
                  const open = !!expanded[cls.id];
                  const rosterId = `roster-${cls.id}`;
                  const quizCount = cls.quizIds?.length || 0;
                  return (
                    <motion.li
                      key={cls.id}
                      layout="position"
                      variants={rise}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                      transition={spring}
                      className="py-5"
                    >
                      {/* Class summary row */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="truncate font-medium text-[hsl(var(--foreground))]">{cls.name}</p>
                          {cls.description && (
                            <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">{cls.description}</p>
                          )}
                          <p className="tabular mt-1 text-xs text-[hsl(var(--muted-foreground))]">{quizCount} {quizCount === 1 ? 'quiz' : 'quizzes'} assigned</p>
                        </div>

                        {/* Invite code */}
                        <div className="flex items-center gap-1">
                          <div>
                            <p className="eyebrow">Invite code</p>
                            <p className="font-mono text-base tracking-[0.18em] text-[hsl(var(--foreground))]">{cls.code}</p>
                          </div>
                          <CopyCodeButton text={cls.code} label={`Copy invite code ${cls.code}`} successMessage="Invite code copied." />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setAssignModal({ open: true, cls })}>
                            <PiBookOpenBold /> Assign quizzes
                          </Button>
                          <Button size="icon" variant="ghost" aria-label={`Edit ${cls.name}`} title="Edit class" onClick={() => openEdit(cls)}>
                            <PiPencilSimpleBold />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label={`Delete ${cls.name}`} title="Delete class" onClick={() => handleDelete(cls)}
                            className="hover:bg-[hsl(var(--tint-red))] hover:text-[hsl(var(--destructive))]">
                            <PiTrashBold />
                          </Button>
                          <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={rosterId} onClick={() => toggleExpand(cls.id)}>
                            <PiUsersBold /> Students
                            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} className="flex"><PiCaretDownBold /></motion.span>
                          </Button>
                        </div>
                      </div>

                      {/* Expanded: student roster */}
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            id={rosterId}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, transition: { duration: 0.12 } }}
                            transition={spring}
                            className="mt-5"
                          >
                            <p className="eyebrow tabular mb-2">Enrolled students ({enrollments[cls.id]?.length ?? '...'})</p>
                            {!enrollments[cls.id] ? (
                              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                                <PiSpinnerGapBold className="h-4 w-4 animate-spin" /> Loading students
                              </div>
                            ) : enrollments[cls.id].length === 0 ? (
                              <p className="text-sm text-[hsl(var(--muted-foreground))]">No students have joined yet. Share the invite code above.</p>
                            ) : (
                              <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                                {enrollments[cls.id].map(e => (
                                  <li key={e.id} className="truncate border-b border-[hsl(var(--border))] py-2 text-sm">{e.studentName}</li>
                                ))}
                              </ul>
                            )}

                            {/* Assignment progress */}
                            {quizCount > 0 && (
                              <div className="mt-6">
                                <p className="eyebrow mb-2">Assignment progress</p>
                                <ul className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
                                  {cls.quizIds.map(qId => {
                                    const quizInfo = quizzes.find(q => q.id === qId);
                                    const due = cls.dueDates?.[qId];
                                    const dueStatus = getDueStatus(due);
                                    const total = enrollments[cls.id]?.length ?? 0;
                                    const done = completions[cls.id]?.[qId];
                                    return (
                                      <li key={qId} className="flex items-center justify-between gap-3 py-2.5">
                                        <p className="flex-1 truncate text-sm font-medium text-[hsl(var(--foreground))]">{quizInfo?.title || 'Quiz'}</p>
                                        <div className="flex shrink-0 items-center gap-3">
                                          {due && (
                                            <Badge variant={dueStatus === 'overdue' ? 'destructive' : dueStatus === 'due-soon' ? 'warning' : 'secondary'}>
                                              <PiCalendarBlankBold className="h-3 w-3" /> {formatDueDate(due)}
                                            </Badge>
                                          )}
                                          <span className="tabular text-xs text-[hsl(var(--muted-foreground))]">
                                            {done === undefined && enrollments[cls.id] && total === 0 ? 'No students yet' : done === undefined ? <PiSpinnerGapBold className="inline h-3 w-3 animate-spin" aria-label="Loading" /> : `${done}/${total} done`}
                                          </span>
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          </>
        )}
      </section>

      {/* ── Create / Edit Modal ── */}
      <Dialog open={modal.open} onOpenChange={v => setModal(m => ({ ...m, open: v }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.mode === 'create' ? 'New class' : 'Edit class'}</DialogTitle>
            <DialogDescription>
              {modal.mode === 'create'
                ? 'Students join with the invite code we generate.'
                : 'Update the class name or description.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-2">
            <FormInput
              label="Class name" required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="For example, Grade 10 Mathematics"
            />
            <FormInput
              label="Description" as="textarea" rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional short description for students"
            />
          </div>
          <div className="flex justify-end gap-3 p-6 pt-4">
            <Button variant="outline" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</Button>
            <Button disabled={saving} onClick={handleSaveClass}>
              {saving && <PiSpinnerGapBold className="animate-spin" />}
              {modal.mode === 'create' ? 'Create class' : 'Save changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Assign Quizzes Modal ── */}
      <Dialog open={assignModal.open} onOpenChange={v => setAssignModal(m => ({ ...m, open: v }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign quizzes to {assignModal.cls?.name}</DialogTitle>
            <DialogDescription>Switch a quiz on to let this class see it. You can add a due date too.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto px-6 py-2">
            {quizzes.length === 0 ? (
              <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No quizzes found. Create a quiz first.
              </p>
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))] border-y border-[hsl(var(--border))]">
                {quizzes.map(quiz => {
                  const assigned = (assignModal.cls?.quizIds || []).includes(quiz.id);
                  const dueDate = assignModal.cls?.dueDates?.[quiz.id] || '';
                  return (
                    <li key={quiz.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={assigned}
                        onClick={() => {
                          handleToggleQuiz(assignModal.cls.id, quiz.id, assignModal.cls?.quizIds || []);
                          // Optimistically update local assignModal.cls
                          setAssignModal(prev => {
                            const ids = prev.cls.quizIds || [];
                            const nextIds = assigned ? ids.filter(id => id !== quiz.id) : [...ids, quiz.id];
                            return { ...prev, cls: { ...prev.cls, quizIds: nextIds } };
                          });
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      >
                        <motion.span
                          animate={{ scale: assigned ? [0.85, 1] : 1 }}
                          transition={spring}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${assigned ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--input))]'}`}
                        >
                          {assigned && <PiCheckBold className="h-3 w-3" />}
                        </motion.span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-medium ${assigned ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{quiz.title}</span>
                          <span className="tabular block truncate text-xs text-[hsl(var(--muted-foreground))]">{quiz.questions?.length || 0} questions · {quiz.totalPoints || 0} pts</span>
                        </span>
                        {assigned && <Badge variant="success" className="shrink-0">Assigned</Badge>}
                      </button>

                      {assigned && (
                        <div className="flex items-center gap-2 pb-3 pl-8">
                          <PiCalendarBlankBold className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                          <input
                            type="date"
                            aria-label={`Due date for ${quiz.title}`}
                            value={dueDate ? dueDate.slice(0, 10) : ''}
                            onChange={async (e) => {
                              const iso = e.target.value ? new Date(e.target.value).toISOString() : null;
                              setAssignModal(prev => ({ ...prev, cls: { ...prev.cls, dueDates: { ...prev.cls.dueDates, [quiz.id]: iso } } }));
                              try { await setQuizDueDate(assignModal.cls.id, quiz.id, iso); }
                              catch { toast.error('Failed to set due date.'); }
                            }}
                            className="rounded-md border border-[hsl(var(--input))] bg-transparent px-2 py-1 text-xs text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--ink))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                          />
                          {dueDate && (
                            <button
                              type="button"
                              aria-label="Clear due date"
                              title="Clear due date"
                              onClick={async () => {
                                setAssignModal(prev => ({ ...prev, cls: { ...prev.cls, dueDates: { ...prev.cls.dueDates, [quiz.id]: null } } }));
                                try { await setQuizDueDate(assignModal.cls.id, quiz.id, null); }
                                catch { toast.error('Failed to clear due date.'); }
                              }}
                              className="cursor-pointer rounded p-1 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--destructive))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                            >
                              <PiXBold className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                            {dueDate ? 'Due date' : 'No due date. Optional.'}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex justify-end p-6 pt-4">
            <Button variant="outline" onClick={() => setAssignModal(m => ({ ...m, open: false }))}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Classes;

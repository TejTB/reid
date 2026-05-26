import { useCallback, useEffect, useState } from 'react';
import { supabase, getProfile, type Task } from '../lib/supabase';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const profile = await getProfile();
    if (!profile) {
      setTasks([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', profile.id)
      .order('completed', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistically toggle completion, then persist. Tasks have no goal link. */
  const toggle = useCallback(async (task: Task) => {
    const next = !task.completed;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, completed: next, completed_at: next ? new Date().toISOString() : null }
          : t,
      ),
    );
    const { error } = await supabase
      .from('tasks')
      .update({ completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq('id', task.id);
    if (error) {
      // revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: task.completed, completed_at: task.completed_at } : t)),
      );
    }
  }, []);

  const openCount = tasks.filter((t) => !t.completed).length;

  return { tasks, loading, refresh: load, toggle, openCount };
}

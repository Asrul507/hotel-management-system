import { supabase } from '../config/supabase';

export const dashboardApi = {
  async stats() {
    const [{ count: totalRooms }, { count: occupied }, { count: dirty }, { count: maintenance }] = await Promise.all([
      supabase.from('rooms').select('*', { count: 'exact', head: true }),
      supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'occupied'),
      supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'dirty'),
      supabase.from('rooms').select('*', { count: 'exact', head: true }).in('status', ['maintenance', 'out_of_order'])
    ]);
    return { totalRooms: totalRooms || 0, occupied: occupied || 0, dirty: dirty || 0, maintenance: maintenance || 0 };
  }
};

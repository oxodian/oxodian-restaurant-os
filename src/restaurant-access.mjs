export const tableAccessSql = `NOT EXISTS(
 SELECT 1 FROM restaurant_assignments a JOIN restaurant_staff r ON r.business_id=a.business_id AND r.email=a.email
 WHERE a.business_id=t.business_id AND a.table_id=t.id AND r.user_id IS NOT NULL AND r.user_id<>?
 AND EXISTS(SELECT 1 FROM sessions x WHERE x.user_id=r.user_id AND x.business_id=r.business_id AND x.expires_at>?)
)`;
export const limitedStaff=session=>session.restaurantStaff?.role==='staff';

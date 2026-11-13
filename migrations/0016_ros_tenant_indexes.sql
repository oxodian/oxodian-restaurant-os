CREATE INDEX ros_orders_tenant_session ON restaurant_orders(business_id,session_id,created_at);
CREATE INDEX ros_orders_tenant_recent ON restaurant_orders(business_id,created_at DESC);
CREATE INDEX ros_orders_pending ON restaurant_orders(business_id,session_id) WHERE status='new';
CREATE INDEX ros_requests_pending ON restaurant_requests(business_id,session_id) WHERE acknowledged=0;
CREATE INDEX ros_sessions_tenant_active ON restaurant_sessions(business_id,table_id) WHERE state<>'closed';
CREATE INDEX ros_payments_tenant_date ON payments(business_id,created_at);

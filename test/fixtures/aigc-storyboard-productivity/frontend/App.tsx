import React, { useEffect, useState } from "react";
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Space, Statistic, Table, Typography } from "antd";
import { invoke } from "@prompt-web/app-runtime";

type Dashboard = {
  metrics: { totalHours: number; effectiveCapacity: number; capacityPerHour: number };
  byPerson: Array<{ personId: string; personName: string; totalHours: number; effectiveCapacity: number; capacityPerHour: number }>;
};

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard>({ metrics: { totalHours: 0, effectiveCapacity: 0, capacityPerHour: 0 }, byPerson: [] });
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Record<string, unknown>>({});

  const refresh = async (next = filters) => {
    try {
      setError("");
      setDashboard(await invoke("dashboard.query", next) as Dashboard);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载失败");
    }
  };
  useEffect(() => {
    let active = true;
    void invoke("dashboard.query", {}).then((result) => {
      if (active) setDashboard(result as Dashboard);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "加载失败");
    });
    return () => { active = false; };
  }, []);

  return <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
    <Typography.Title level={2}>AIGC 短剧分镜产能统计</Typography.Title>
    <Space wrap style={{ marginBottom: 16 }}>
      <Input placeholder="项目 ID" onChange={(event) => setFilters((value) => ({ ...value, projectId: event.target.value }))} />
      <Input placeholder="人员 ID" onChange={(event) => setFilters((value) => ({ ...value, personId: event.target.value }))} />
      <DatePicker.RangePicker onChange={(dates) => setFilters((value) => ({ ...value, dateFrom: dates?.[0]?.format("YYYY-MM-DD") || "", dateTo: dates?.[1]?.format("YYYY-MM-DD") || "" }))} />
      <Button type="primary" onClick={() => void refresh()}>应用筛选</Button>
    </Space>
    {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
    <Row gutter={16}>
      <Col span={8}><Card><Statistic title="总工时" value={dashboard.metrics.totalHours} precision={1} suffix="h" /></Card></Col>
      <Col span={8}><Card><Statistic title="有效产能" value={dashboard.metrics.effectiveCapacity} precision={1} /></Card></Col>
      <Col span={8}><Card><Statistic title="人时产能" value={dashboard.metrics.capacityPerHour} precision={2} /></Card></Col>
    </Row>
    <Card title="人员维度" style={{ marginTop: 16 }}>
      <Table rowKey="personId" pagination={false} dataSource={dashboard.byPerson} columns={[
        { title: "分镜师", dataIndex: "personName" },
        { title: "工时", dataIndex: "totalHours" },
        { title: "有效产能", dataIndex: "effectiveCapacity" },
        { title: "人时产能", dataIndex: "capacityPerHour" },
      ]} />
    </Card>
    <Card title="录入工时" style={{ marginTop: 16 }}>
      <Form layout="inline" onFinish={async (values) => {
        await invoke("worklog.create", { ...values, idempotencyKey: crypto.randomUUID() });
        await refresh();
      }}>
        <Form.Item name="personId" rules={[{ required: true }]}><Input placeholder="人员 ID" /></Form.Item>
        <Form.Item name="projectId" rules={[{ required: true }]}><Input placeholder="项目 ID" /></Form.Item>
        <Form.Item name="taskId" rules={[{ required: true }]}><Input placeholder="任务 ID" /></Form.Item>
        <Form.Item name="workDate" rules={[{ required: true }]}><Input placeholder="2026-09-26" /></Form.Item>
        <Form.Item name="hours" rules={[{ required: true }]}><InputNumber min={0} placeholder="工时" /></Form.Item>
        <Form.Item name="completedShots" rules={[{ required: true }]}><InputNumber min={0} placeholder="完成镜头" /></Form.Item>
        <Form.Item name="complexityWeight" initialValue={1}><InputNumber min={0.1} step={0.1} /></Form.Item>
        <Button htmlType="submit" type="primary">保存</Button>
      </Form>
    </Card>
  </main>;
}

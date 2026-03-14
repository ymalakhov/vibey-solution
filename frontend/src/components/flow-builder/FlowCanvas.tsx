"use client";

import { useCallback, useRef, DragEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TriggerNode } from "./nodes/TriggerNode";
import { QuestionNode } from "./nodes/QuestionNode";
import { ToolNode } from "./nodes/ToolNode";
import { GuardrailNode } from "./nodes/GuardrailNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { ResponseNode } from "./nodes/ResponseNode";
import { EscalationNode } from "./nodes/EscalationNode";
import { SkillNode } from "./nodes/SkillNode";

const nodeTypes = {
  trigger: TriggerNode,
  question: QuestionNode,
  tool: ToolNode,
  guardrail: GuardrailNode,
  condition: ConditionNode,
  response: ResponseNode,
  escalation: EscalationNode,
  skill: SkillNode,
};

const defaultNodeData: Record<string, () => Record<string, any>> = {
  trigger: () => ({ label: "Trigger", intents: [], description: "" }),
  question: () => ({
    label: "Question",
    question_text: "",
    variable_name: "",
    validation: "",
    required: true,
  }),
  tool: () => ({ label: "Tool", tool_id: "", input_mapping: {} }),
  guardrail: () => ({
    label: "Guardrail",
    check_type: "",
    condition: "",
    fail_message: "",
    on_fail_action: "block",
  }),
  condition: () => ({
    label: "Condition",
    variable: "",
    operator: "equals",
    value: "",
  }),
  response: () => ({
    label: "Response",
    message_template: "",
    ai_instructions: "",
  }),
  escalation: () => ({
    label: "Escalation",
    reason: "",
    generate_summary: false,
    priority_override: "",
    handoff_notes_template: "",
  }),
  skill: () => ({
    label: "Skill",
    skill_id: "",
    skill_name: "",
  }),
};

interface Props {
  initialNodes: Node[];
  initialEdges: Edge[];
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onNodeSelect: (node: Node | null) => void;
  onNodeDataUpdate: (nodeId: string, data: any) => void;
}

let idCounter = 0;
function nextId() {
  return `node-${Date.now()}-${idCounter++}`;
}

export function FlowCanvas({
  initialNodes,
  initialEdges,
  onNodesChange: onNodesExternal,
  onEdgesChange: onEdgesExternal,
  onNodeSelect,
  onNodeDataUpdate,
}: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(
          {
            ...connection,
            id: `e-${Date.now()}`,
            animated: true,
            style: { strokeWidth: 2 },
          },
          eds
        );
        onEdgesExternal(newEdges);
        return newEdges;
      });
    },
    [setEdges, onEdgesExternal]
  );

  const onNodesChangeHandler = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      // Defer reporting to parent to capture the updated state
      setTimeout(() => {
        setNodes((nds) => {
          onNodesExternal(nds);
          return nds;
        });
      }, 0);
    },
    [onNodesChange, setNodes, onNodesExternal]
  );

  const onEdgesChangeHandler = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      setTimeout(() => {
        setEdges((eds) => {
          onEdgesExternal(eds);
          return eds;
        });
      }, 0);
    },
    [onEdgesChange, setEdges, onEdgesExternal]
  );

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      onNodeSelect(node);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowInstance.current || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const newNode: Node = {
        id: nextId(),
        type,
        position,
        data: defaultNodeData[type]?.() || { label: type },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        onNodesExternal(updated);
        return updated;
      });
    },
    [setNodes, onNodesExternal]
  );

  // Expose a way for parent to update node data
  // We handle this through a callback
  const updateNodeData = useCallback(
    (nodeId: string, data: any) => {
      setNodes((nds) => {
        const updated = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...data } } : n
        );
        onNodesExternal(updated);
        return updated;
      });
    },
    [setNodes, onNodesExternal]
  );

  // Register the update callback
  if (onNodeDataUpdate !== updateNodeData) {
    // Parent will call this directly — store it
    (FlowCanvas as any)._updateNodeData = updateNodeData;
  }

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChangeHandler}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        className="bg-gray-50"
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          className="!bg-white !border-gray-200"
        />
      </ReactFlow>
    </div>
  );
}

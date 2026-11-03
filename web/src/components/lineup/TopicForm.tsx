import { useState, type FormEvent } from 'react';
import { ArrowRight, Minus, Plus, Sparkles } from 'lucide-react';
import {
  CreateDiscussionRequestSchema,
  EXPERT_COUNT,
  TOPIC_LENGTH
} from '@aps/shared';
import { Button } from '../ui/Button';

const EXAMPLE_TOPICS = [
  'AI 助手应该先进入哪些企业客服场景？',
  '远程办公会全面取代固定坐班吗？',
  '生成式 AI 应如何进入大学课堂？'
];

interface TopicFormProps {
  initialTopic?: string;
  initialExpertCount?: number;
  busy?: boolean;
  error?: string | null;
  onSubmit: (topic: string, expertCount: number) => void;
}

export function TopicForm({
  initialTopic = '',
  initialExpertCount = EXPERT_COUNT.default,
  busy = false,
  error = null,
  onSubmit
}: TopicFormProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [expertCount, setExpertCount] = useState(initialExpertCount);
  const [validationError, setValidationError] = useState<string | null>(null);
  const trimmedLength = topic.trim().length;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = CreateDiscussionRequestSchema.safeParse({
      topic,
      expertCount
    });
    if (!result.success) {
      setValidationError(
        result.error.issues[0]?.message ?? '请检查话题与专家人数。'
      );
      return;
    }
    setValidationError(null);
    onSubmit(result.data.topic, result.data.expertCount);
  };

  return (
    <form className="topic-form" onSubmit={submit} noValidate>
      <div className="topic-form__field">
        <div className="topic-form__label-row">
          <label htmlFor="discussion-topic">今晚想聊什么？</label>
          <span className="topic-form__field-hint">必填 · 2–200 字</span>
        </div>
        <textarea
          autoComplete="off"
          id="discussion-topic"
          maxLength={TOPIC_LENGTH.max}
          name="topic"
          onChange={(event) => {
            setTopic(event.target.value);
            setValidationError(null);
          }}
          placeholder="例如：AI 助手应该先进入哪些企业客服场景？"
          rows={4}
          value={topic}
          aria-describedby="topic-count topic-validation"
          aria-invalid={Boolean(validationError || error)}
        />
        <div className="topic-form__meta">
          <span
            className={
              trimmedLength > 0 && trimmedLength < TOPIC_LENGTH.min
                ? 'topic-form__counter is-warning'
                : 'topic-form__counter'
            }
            id="topic-count"
          >
            {trimmedLength} / {TOPIC_LENGTH.max}
          </span>
          {trimmedLength > 0 && trimmedLength < TOPIC_LENGTH.min ? (
            <span className="topic-form__inline-hint">
              话题至少需要 {TOPIC_LENGTH.min} 字
            </span>
          ) : null}
        </div>
        <p
          aria-live="polite"
          className="field-error"
          id="topic-validation"
        >
          {validationError ?? error ?? ''}
        </p>
      </div>

      <div className="topic-form__examples">
        <span className="topic-form__label">试试这些话题</span>
        <div className="topic-chip-list">
          {EXAMPLE_TOPICS.map((example) => (
            <button
              className="topic-chip"
              key={example}
              onClick={() => {
                setTopic(example);
                setValidationError(null);
              }}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="topic-form__bottom">
        <div className="expert-stepper">
          <div>
            <span className="topic-form__label">邀请专家</span>
            <span className="expert-stepper__note">不含主持人 · 2–6 位</span>
          </div>
          <div className="expert-stepper__controls">
            <button
              aria-label="减少专家人数"
              className="stepper-button"
              disabled={expertCount <= EXPERT_COUNT.min || busy}
              onClick={() =>
                setExpertCount((count) => Math.max(EXPERT_COUNT.min, count - 1))
              }
              type="button"
            >
              <Minus size={15} />
            </button>
            <output aria-live="polite" className="expert-stepper__value">
              {expertCount}
            </output>
            <button
              aria-label="增加专家人数"
              className="stepper-button"
              disabled={expertCount >= EXPERT_COUNT.max || busy}
              onClick={() =>
                setExpertCount((count) => Math.min(EXPERT_COUNT.max, count + 1))
              }
              type="button"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
        <Button
          className="topic-form__submit"
          disabled={busy}
          icon={busy ? <Sparkles size={17} /> : <ArrowRight size={17} />}
          size="lg"
          type="submit"
          variant="primary"
        >
          {busy ? '正在邀请嘉宾…' : '生成嘉宾阵容'}
        </Button>
      </div>
    </form>
  );
}

export type MockTopicGroup = 'programming' | 'service' | 'general';
export type MockDetailKind = 'example' | 'condition' | 'evidence';

export interface MockDetail {
  kind: MockDetailKind;
  text: string;
}

export interface MockArgument {
  issue: string;
  text: string;
  position: string;
  side: string;
  claim: string;
  detail: MockDetail;
}

export interface SpeakerProfile {
  name: string;
  profession: string;
  title: string;
  stance: string;
  stanceClaim: string;
  stanceTag: string;
  persona: string;
  arguments: readonly MockArgument[];
}

interface BaseArgument {
  issue: string;
  text: string;
  position: string;
}

interface BaseSpeakerProfile extends Omit<SpeakerProfile, 'stanceClaim' | 'arguments'> {
  arguments: readonly BaseArgument[];
}

export interface MockIssueDefinition {
  issue: string;
  sides: readonly [string, string];
}

export const MOCK_ISSUE_GROUPS: Record<
  MockTopicGroup,
  readonly MockIssueDefinition[]
> = {
  programming: [
    { issue: '哪些任务可交给助手', sides: ['低风险任务先交给助手', '基础任务先由新人完成'] },
    { issue: '新人要不要独立排错', sides: ['助手参与排错且新人能解释', '新人独立定位后再求助'] },
    { issue: '改动出错由谁负责', sides: ['使用者复核后由提交者担责', '未经人工确认不使用助手'] },
    { issue: '节省时间如何使用', sides: ['节省时间转成更多交付', '节省时间投入培养练习'] }
  ],
  service: [
    { issue: '哪些问题适合自动回复', sides: ['规则清楚的问题先自动回复', '复杂敏感问题先由人工判断'] },
    { issue: '用户何时转接人工', sides: ['未解决时流程主动升级', '用户或人工决定转接'] },
    { issue: '误答怎样复盘纠正', sides: ['自动答复分层记录并复盘', '质量判断必须由人工负责'] },
    { issue: '答复责任如何追溯', sides: ['记录规则版本和交接过程', '明确人工岗位的补救责任'] }
  ],
  general: [
    { issue: '试行范围怎么划定', sides: ['小范围可撤回试行', '不同现场不宜统一推进'] },
    { issue: '成本应该由谁承担', sides: ['按受益程度公开分担成本', '不把额外成本转给弱势群体'] },
    { issue: '效果应该如何衡量', sides: ['预设指标后评估是否扩大', '分组检查影响和不确定性'] },
    { issue: '问题出现后谁来纠偏', sides: ['按预设条件及时调整', '出现异常先暂停并定责'] }
  ]
};

const RAW_PROFILE_GROUPS: Record<
  MockTopicGroup,
  readonly BaseSpeakerProfile[]
> = {
  programming: [
    {
      name: '陈澄',
      profession: '软件工程师',
      title: '应用开发负责人',
      stance: '支持助手处理规则明确的小改动，但提交前必须有人复核。',
      stanceTag: '有条件支持',
      persona: '关注交付边界与复核责任，习惯用可执行流程说明观点。',
      arguments: [
        {
          issue: '哪些任务可交给助手',
          position: '支持低风险小改动',
          text: '格式固定且失败可回退的小改动适合先交给助手处理。'
        },
        {
          issue: '新人要不要独立排错',
          position: '主张助手提示后新人解释',
          text: '助手先给出报错线索，新人再说明如何定位问题。'
        },
        {
          issue: '改动出错由谁负责',
          position: '主张提交者复核并担责',
          text: '提交者要说明每处修改，并复核助手生成的结果。'
        },
        {
          issue: '节省时间如何使用',
          position: '主张节省时间扩大交付',
          text: '省下的时间可以承接新任务，同时留出指导练习。'
        }
      ]
    },
    {
      name: '周明',
      profession: '工程教育顾问',
      title: '新人培养顾问',
      stance: '担心助手包办基础编码会减少新人练习机会。',
      stanceTag: '谨慎',
      persona: '关注学习过程与反馈质量，表达克制，会区分完成任务和掌握能力。',
      arguments: [
        {
          issue: '哪些任务可交给助手',
          position: '主张简单任务先由新人完成',
          text: '即使输入看似简单，新人自己完成一遍也能发现理解缺口。'
        },
        {
          issue: '新人要不要独立排错',
          position: '认为新人先独立排错',
          text: '第一次排查先让新人列出检查顺序，再开放辅助提示。'
        },
        {
          issue: '改动出错由谁负责',
          position: '主张提交者复核后担责',
          text: '复核记录写清修改理由，提交者仍要承担确认责任。'
        },
        {
          issue: '节省时间如何使用',
          position: '担心节省不等于练习',
          text: '少敲写的时间应排进带教练习，不能默认增加任务。'
        }
      ]
    },
    {
      name: '顾言',
      profession: '劳动经济研究员',
      title: '数字就业研究员',
      stance: '认为工具带来的产能变化取决于新增需求和团队分工。',
      stanceTag: '审慎乐观',
      persona: '重视可比较的岗位与任务变化，不把单一效率指标当作结论。',
      arguments: [
        {
          issue: '哪些任务可交给助手',
          position: '主张区分任务效率和岗位变化',
          text: '任务变化与岗位影响应分开评估，不能只看效率。'
        },
        {
          issue: '新人要不要独立排错',
          position: '主张助手辅助排错',
          text: '助手先给调试线索，新人再解释采纳或拒绝的理由。'
        },
        {
          issue: '改动出错由谁负责',
          position: '主张提交者确认后提交',
          text: '工具生成的改动仍由提交者逐项确认后提交。'
        },
        {
          issue: '节省时间如何使用',
          position: '主张节省时间扩大交付',
          text: '新增需求多时，节省的时间可能用于扩大交付，而不是减少岗位。'
        }
      ]
    },
    {
      name: '唐宁',
      profession: '职业教育教师',
      title: '软件人才培养负责人',
      stance: '反对把生成结果当作新人能力的替代品，训练仍要从理解问题开始。',
      stanceTag: '反对',
      persona: '重视基础训练和逐步放手，善于把培养要求落实为课堂任务。',
      arguments: [
        {
          issue: '哪些任务可交给助手',
          position: '反对跳过问题拆解训练',
          text: '跳过问题拆解会让新人难以判断；生成内容是否答非所问也要进一步核对。'
        },
        {
          issue: '新人要不要独立排错',
          position: '要求新人独立拆解',
          text: '训练应先让新人自己写出步骤，再比较工具给出的方案。'
        },
        {
          issue: '改动出错由谁负责',
          position: '主张学生解释修改依据',
          text: '工具结果不能代替学生说明修改依据。'
        },
        {
          issue: '节省时间如何使用',
          position: '主张培养计划保留练习',
          text: '培养计划要明确保留练习环节，不能等空闲时间自然出现。'
        }
      ]
    },
    {
      name: '许闻溪',
      profession: '开发工具产品经理',
      title: '工具产品负责人',
      stance: '支持逐步采用助手，但要让人工复核过程清楚可见。',
      stanceTag: '支持',
      persona: '关注产品机制和责任闭环，表达直接，优先讨论可验证的边界。',
      arguments: [
        {
          issue: '哪些任务可交给助手',
          position: '主张先开放可撤回任务',
          text: '首批功能应允许随时撤回，并把可处理的任务范围写清楚。'
        },
        {
          issue: '新人要不要独立排错',
          position: '主张训练设置解释停顿',
          text: '练习可以安排解释步骤，让新人先解释自己的方案再继续。'
        },
        {
          issue: '改动出错由谁负责',
          position: '主张确认人内容可追溯',
          text: '复核记录保留确认人与修改内容，才能让责任分工可追溯。'
        },
        {
          issue: '节省时间如何使用',
          position: '主张节省时间扩大交付',
          text: '节省时间可用来接更多任务，同时要求新人独立接手后续工作。'
        }
      ]
    },
    {
      name: '林舟',
      profession: '研发效能顾问',
      title: '工程效能研究员',
      stance: '团队安排会改变任务评估，也要核对需求变化。',
      stanceTag: '中立',
      persona: '关注可比较的指标和流程差异，避免把局部变化推广到所有团队。',
      arguments: [
        {
          issue: '哪些任务可交给助手',
          position: '主张先记录任务占比',
          text: '重复任务占比决定哪些任务可先交给助手。'
        },
        {
          issue: '新人要不要独立排错',
          position: '主张练习时间不被交付挤占',
          text: '新人练习时间应单独记录，才能看出交付是否挤占学习。'
        },
        {
          issue: '改动出错由谁负责',
          position: '主张明确人工确认角色',
          text: '流程要标清每次改动由谁确认，不能只统计是否通过。'
        },
        {
          issue: '节省时间如何使用',
          position: '主张节省时间投入练习',
          text: '节省时间应让新人获得更多练习，而非自动转成额外交付。'
        }
      ]
    }
  ],
  service: [
    {
      name: '林知夏',
      profession: '服务设计师',
      title: '客户体验顾问',
      stance: '支持规则清楚的问题先试点自动回复，并保留人工入口。',
      stanceTag: '支持',
      persona: '关注服务流程与体验落差，善于把抽象判断拆成具体环节。',
      arguments: [
        {
          issue: '哪些问题适合自动回复',
          position: '支持规则咨询自动回复',
          text: '规则固定且后果较轻的咨询适合先交给自动回复处理。'
        },
        {
          issue: '用户何时转接人工',
          position: '主张未解决时立即转人工',
          text: '未解决时应直接提供人工接手入口。'
        },
        {
          issue: '误答怎样复盘纠正',
          position: '主张复盘区分问题影响',
          text: '复盘应按问题影响分层，平均满意度会遮住严重误答。'
        },
        {
          issue: '答复责任如何追溯',
          position: '主张记录规则和处理过程',
          text: '每条答复都应保留规则版本和处理记录，方便及时纠错。'
        }
      ]
    },
    {
      name: '沈予安',
      profession: '消费者研究员',
      title: '用户研究负责人',
      stance: '担心复杂诉求会被分错，用户在反复转接中失去耐心。',
      stanceTag: '审慎',
      persona: '关注用户权益与沟通体验，能从具体诉求中发现流程断点。',
      arguments: [
        {
          issue: '哪些问题适合自动回复',
          position: '担心复杂诉求分类错误',
          text: '同一句描述可能包含多个需求，预设分类容易漏掉真正的问题。'
        },
        {
          issue: '用户何时转接人工',
          position: '要求用户可直接请求人工',
          text: '用户要求人工时不该让他重复信息，系统应直接转接。'
        },
        {
          issue: '误答怎样复盘纠正',
          position: '主张严重误答单独复盘',
          text: '严重误答需要单独复盘，不能被大量简单咨询的好评冲淡。'
        },
        {
          issue: '答复责任如何追溯',
          position: '主张保留答复和交接记录',
          text: '交接时应保留答复版本和处理经过，方便用户追问。'
        }
      ]
    },
    {
      name: '许行之',
      profession: '客户运营专家',
      title: '服务运营负责人',
      stance: '有条件支持限定范围试点，前提是疑难问题能及时交给人工。',
      stanceTag: '有条件支持',
      persona: '熟悉交接流程和异常处理，讲话务实，关注服务连续性。',
      arguments: [
        {
          issue: '哪些问题适合自动回复',
          position: '主张重复咨询先试点',
          text: '答案稳定的重复咨询适合先试点，遇到例外就退出自动流程。'
        },
        {
          issue: '用户何时转接人工',
          position: '强调复杂情况升级',
          text: '升级入口应把完整上下文交给人工，不要让用户重新描述经过。'
        },
        {
          issue: '误答怎样复盘纠正',
          position: '主张区分是否解决',
          text: '一次解决和多轮未解决应分开统计，结束对话不等于成功。'
        },
        {
          issue: '答复责任如何追溯',
          position: '主张记录交接责任',
          text: '每次交接都要记录负责人和处理结果，才能查清问题卡在哪一环。'
        }
      ]
    },
    {
      name: '程望舒',
      profession: '劳动关系研究员',
      title: '服务质量研究员',
      stance: '反对用自动化替代服务质量评估，处理结果仍需有人检查。',
      stanceTag: '反对',
      persona: '关注服务岗位与评价机制，表达谨慎，重视可观察的长期影响。',
      arguments: [
        {
          issue: '哪些问题适合自动回复',
          position: '反对只按难度划分问题',
          text: '看似简单的问题也可能影响用户权益，不能只按字面难度分类。'
        },
        {
          issue: '用户何时转接人工',
          position: '主张人工保留处置权',
          text: '自动答复不能替代最终处置责任，人工应能随时接管未解决情况。'
        },
        {
          issue: '误答怎样复盘纠正',
          position: '反对系统独自评估质量',
          text: '评估标准不能由自动流程自己打分，还要纳入人工核验结果。'
        },
        {
          issue: '答复责任如何追溯',
          position: '主张错误补救责任到岗',
          text: '错误答复后的补救责任要明确到岗位，不能留在模糊的流程之间。'
        }
      ]
    },
    {
      name: '周以宁',
      profession: '信息安全顾问',
      title: '数据治理顾问',
      stance: '支持有限范围试点，并要求访问权限和处理责任都清楚。',
      stanceTag: '支持',
      persona: '熟悉数据治理与审计机制，表达简洁，关注权限边界。',
      arguments: [
        {
          issue: '哪些问题适合自动回复',
          position: '支持规则清楚的问题先试点',
          text: '规则固定且后果较轻的问题适合先试用自动回复。'
        },
        {
          issue: '用户何时转接人工',
          position: '主张未解决时主动转交',
          text: '连续两轮仍未解决时，系统应把完整上下文转给人工。'
        },
        {
          issue: '误答怎样复盘纠正',
          position: '主张审计异常答复链路',
          text: '抽查异常答复时应还原规则版本和输入依据。'
        },
        {
          issue: '答复责任如何追溯',
          position: '认为访问修改都应留痕',
          text: '访问与修改动作都要留痕，争议时才能查清处理过程。'
        }
      ]
    },
    {
      name: '顾行舟',
      profession: '产品研究员',
      title: '智能服务研究员',
      stance: '按问题类型比较效果后再决定是否扩大使用范围。',
      stanceTag: '中立',
      persona: '重视实验设计和结论边界，不把局部表现推广到全部场景。',
      arguments: [
        {
          issue: '哪些问题适合自动回复',
          position: '主张分类比较效果',
          text: '不同问题分组比较能看出答复稳定性。'
        },
        {
          issue: '用户何时转接人工',
          position: '主张保留人工转接入口',
          text: '人工等待时长应单独记录，避免自动流程延误求助。'
        },
        {
          issue: '误答怎样复盘纠正',
          position: '主张答案正确不等于解决',
          text: '答案正确不代表诉求已经解决，两种结果应分别统计。'
        },
        {
          issue: '答复责任如何追溯',
          position: '主张明确人工与系统分工',
          text: '评估结论应说明自动答复和人工接手各自承担的责任。'
        }
      ]
    }
  ],
  general: [
    {
      name: '沈清和',
      profession: '方案评估研究员',
      title: '项目评估顾问',
      stance: '支持范围清楚且可以撤回的方案先行试行。',
      stanceTag: '支持',
      persona: '关注执行条件与可验证收益，表达简洁，习惯拆解判断依据。',
      arguments: [
        {
          issue: '试行范围怎么划定',
          position: '支持从可撤回方案开始',
          text: '范围清楚的方案适合作为第一步，并应允许及时撤回。'
        },
        {
          issue: '成本应该由谁承担',
          position: '主张核算受益与成本',
          text: '公开受益对象和成本承担者能看清分配差异。'
        },
        {
          issue: '效果应该如何衡量',
          position: '主张先公开目标结果',
          text: '预期目标和观察方式应在试行前公开。'
        },
        {
          issue: '问题出现后谁来纠偏',
          position: '主张预设暂停调整条件',
          text: '开始前应约定暂停或调整条件，避免临时发现问题无人负责。'
        }
      ]
    },
    {
      name: '顾南乔',
      profession: '社会学研究者',
      title: '社会影响研究员',
      stance: '担心统一安排会让选择较少的人群承担成本。',
      stanceTag: '审慎',
      persona: '关注利益分配和不同群体承担的代价，善于追问受影响者。',
      arguments: [
        {
          issue: '试行范围怎么划定',
          position: '担心弱者承担更多成本',
          text: '一致安排可能让选择较少的人承担更多代价。'
        },
        {
          issue: '成本应该由谁承担',
          position: '主张按受益程度分担成本',
          text: '按受益程度分担费用，避免成本落在少数人身上。'
        },
        {
          issue: '效果应该如何衡量',
          position: '主张分组观察影响差异',
          text: '不同群体受到的影响差异应分别评估，不能只看总体均值。'
        },
        {
          issue: '问题出现后谁来纠偏',
          position: '主张提供反馈渠道',
          text: '受影响者应有明确反馈渠道，问题才能进入后续复盘。'
        }
      ]
    },
    {
      name: '周景行',
      profession: '政策顾问',
      title: '公共政策研究员',
      stance: '有条件支持逐步实施，并公布衡量标准和调整渠道。',
      stanceTag: '有条件支持',
      persona: '重视实施条件与评估闭环，表达严谨，会拆解执行顺序。',
      arguments: [
        {
          issue: '试行范围怎么划定',
          position: '主张先设边界再扩大',
          text: '适用对象和时段应先限定，再根据观察结果逐步扩大。'
        },
        {
          issue: '成本应该由谁承担',
          position: '主张公开收益与成本分配',
          text: '公开收益时应同步说明各群体承担的成本。'
        },
        {
          issue: '效果应该如何衡量',
          position: '主张实施前确定指标',
          text: '评估指标应在试行前确定，避免事后只挑有利结果。'
        },
        {
          issue: '问题出现后谁来纠偏',
          position: '主张预先明确调整条件',
          text: '执行者应预先知道哪些情况必须触发调整。'
        }
      ]
    },
    {
      name: '林予川',
      profession: '一线从业者',
      title: '实践项目负责人',
      stance: '反对仓促推广，现场差异不能被单一指标覆盖。',
      stanceTag: '反对',
      persona: '熟悉执行中的现实约束，表达直白，重视现场反馈。',
      arguments: [
        {
          issue: '试行范围怎么划定',
          position: '反对现场套用同一方案',
          text: '不同地点的条件差异很大，统一安排容易漏掉例外情况。'
        },
        {
          issue: '成本应该由谁承担',
          position: '指出一线承担隐性成本',
          text: '临时补救会占用一线时间，不能只看预算成本。'
        },
        {
          issue: '效果应该如何衡量',
          position: '主张按现场检查过程影响',
          text: '最终结果会漏掉现场反复调整的成本。'
        },
        {
          issue: '问题出现后谁来纠偏',
          position: '主张一线问题及时上报',
          text: '执行者应能直接上报问题，不能等周期结束才纠正。'
        }
      ]
    },
    {
      name: '唐知意',
      profession: '数据分析师',
      title: '应用评估负责人',
      stance: '支持小范围试行，同时公开结果和不确定性。',
      stanceTag: '谨慎乐观',
      persona: '擅长评估方法，表达克制，强调样本范围和结论边界。',
      arguments: [
        {
          issue: '试行范围怎么划定',
          position: '主张说明样本覆盖范围',
          text: '样本覆盖范围决定结果适用于哪些情形。'
        },
        {
          issue: '成本应该由谁承担',
          position: '主张分组核算收益代价',
          text: '收益与代价应分别按群体拆分核算。'
        },
        {
          issue: '效果应该如何衡量',
          position: '主张报告结果不确定性',
          text: '报告结果时应说明不确定性，避免把估计当成定论。'
        },
        {
          issue: '问题出现后谁来纠偏',
          position: '主张复核后再调整方案',
          text: '阶段复核能把新证据纳入下一步安排。'
        }
      ]
    },
    {
      name: '许闻溪',
      profession: '风险治理专家',
      title: '风险管理顾问',
      stance: '出现问题时先明确责任与补救办法。',
      stanceTag: '中立',
      persona: '关注风险预案与责任闭环，喜欢把讨论落到可执行机制。',
      arguments: [
        {
          issue: '试行范围怎么划定',
          position: '主张不确定时可退出',
          text: '预设范围外的情况应暂停并转入人工判断。'
        },
        {
          issue: '成本应该由谁承担',
          position: '主张计入补救成本',
          text: '估算方案成本时应计入补救支出。'
        },
        {
          issue: '效果应该如何衡量',
          position: '主张提前约定失败信号',
          text: '方案失效信号应在试行前约定，避免争议时改标准。'
        },
        {
          issue: '问题出现后谁来纠偏',
          position: '主张明确纠偏负责人',
          text: '出现问题后应指定跟进负责人，避免补救事项无人收尾。'
        }
      ]
    }
  ]
};

type ArgumentMetadata = readonly [
  sideIndex: 0 | 1,
  claim: string,
  detailKind: MockDetailKind,
  detailText: string
];

interface ProfileMetadata {
  stanceClaim: string;
  arguments: readonly ArgumentMetadata[];
}

const PROFILE_METADATA: Record<string, ProfileMetadata> = {
  陈澄: {
    stanceClaim: '支持助手处理规则明确的小改动',
    arguments: [
      [0, '小改动适合先交给助手处理', 'example', '在格式化脚本里先整理缩进，再由提交者检查差异'],
      [0, '新人再说明如何定位问题', 'condition', '练习目标是理解排错过程而不是只求一次通过时'],
      [0, '提交者要说明每处修改', 'evidence', '查看提交记录里的修改说明、复核人和回滚结果'],
      [0, '省下的时间可以承接新任务', 'example', '团队把每周省下的格式整理时间用于处理积压需求']
    ]
  },
  周明: {
    stanceClaim: '助手包办基础编码会减少新人练习机会',
    arguments: [
      [1, '新人自己完成一遍也能发现理解缺口', 'example', '新人第一次修改表单校验时先写预期输入和结果'],
      [1, '新人列出检查顺序', 'condition', '新人先提交自己的定位步骤后才开放辅助提示'],
      [0, '提交者仍要承担确认责任', 'evidence', '对照复核表中的修改理由和提交者确认记录'],
      [1, '少敲写的时间应排进带教练习', 'example', '每周固定安排一次新人讲解已完成任务的练习']
    ]
  },
  顾言: {
    stanceClaim: '产能变化取决于新增需求和团队分工',
    arguments: [
      [1, '任务变化与岗位影响应分开评估', 'evidence', '分别统计任务变化和新增岗位数量'],
      [0, '新人再解释采纳或拒绝的理由', 'example', '助手给出报错线索后让新人逐条验证'],
      [0, '改动仍由提交者逐项确认后提交', 'condition', '提交者说明修改理由并通过复核后才合并'],
          [0, '节省的时间可能用于扩大交付', 'evidence', '统计新增需求被接手的数量和排期变化']
    ]
  },
  唐宁: {
    stanceClaim: '反对把生成结果当作新人能力的替代品',
    arguments: [
      [1, '跳过问题拆解会让新人难以判断', 'example', '让新人先拆解输入校验步骤，再查看生成方案'],
      [1, '训练应先让新人自己写出步骤', 'condition', '新人能解释每个排查步骤后才开放工具输出'],
      [1, '工具结果不能代替学生说明修改依据', 'evidence', '检查作业中的修改说明和人工评阅记录'],
      [1, '培养计划要明确保留练习环节', 'example', '每周把一次完整排错过程纳入课程计划']
    ]
  },
  'programming:许闻溪': {
    stanceClaim: '支持逐步采用助手',
    arguments: [
      [0, '首批功能应允许随时撤回', 'condition', '首批任务出错后能恢复原版本时'],
      [0, '新人先解释自己的方案', 'example', '新人先提交方案，再查看助手给出的提示'],
      [0, '复核记录保留确认人与修改内容', 'evidence', '查看每次确认人的签名和对应修改差异'],
      [0, '节省时间可用来接更多任务', 'condition', '后续任务需要新人独立接手且有时间复盘时']
    ]
  },
  林舟: {
    stanceClaim: '团队安排会改变任务评估',
    arguments: [
      [0, '重复任务占比决定哪些任务可先交给助手', 'evidence', '按团队记录重复任务占全部任务的比例'],
      [1, '新人练习时间应单独记录', 'example', '把提交前练习时长和实际交付时间分开记录'],
      [0, '流程要标清每次改动由谁确认', 'condition', '每次人工确认都能关联到具体修改内容时'],
      [1, '节省时间应让新人获得更多练习', 'evidence', '比较节省时间流向交付与练习的记录']
    ]
  },
  林知夏: {
    stanceClaim: '支持规则清楚的问题先试点',
    arguments: [
      [0, '后果较轻的咨询适合先交给自动回复', 'example', '先处理营业时间和退换进度这类固定规则咨询'],
      [0, '未解决时应直接提供人工接手入口', 'condition', '答案来源固定且用户随时能转人工时'],
      [0, '平均满意度会遮住严重误答', 'evidence', '按问题类型统计自动解决率和转人工次数'],
      [0, '每条答复都应保留规则版本', 'evidence', '检查规则版本、答复内容和后续纠正记录']
    ]
  },
  沈予安: {
    stanceClaim: '复杂诉求会被分错',
    arguments: [
      [1, '同一句描述可能包含多个需求', 'example', '一次留言同时询问账单、退款和配送时'],
      [1, '用户要求人工时不该让他重复信息', 'condition', '用户已经说明诉求但问题仍未解决时'],
      [0, '严重误答需要单独复盘', 'evidence', '单独统计高影响误答和重复转接案例'],
      [0, '交接时应保留答复版本和处理经过', 'example', '错误答复后由指定人员向用户说明补救步骤']
    ]
  },
  许行之: {
    stanceClaim: '支持限定范围试点',
    arguments: [
      [0, '答案稳定的重复咨询适合先试点', 'condition', '问题有固定答案且例外能退出自动流程时'],
      [0, '升级入口应把完整上下文交给人工', 'example', '退款进度连续两轮未解决后转交人工'],
      [0, '结束对话不等于成功', 'evidence', '分别统计一次解决与多轮转接的数据'],
      [0, '每次交接都要记录负责人和处理结果', 'evidence', '核对每次转交的负责人、上下文和处理结果']
    ]
  },
  程望舒: {
    stanceClaim: '反对用自动化替代服务质量评估',
    arguments: [
      [1, '看似简单的问题也可能影响用户权益', 'example', '简单的扣费问题也可能影响用户权益'],
      [1, '人工应能随时接管未解决情况', 'condition', '人工能够接手未解决的问题并承担最终处置时'],
      [1, '评估标准不能由自动流程自己打分', 'evidence', '把人工核验结果与系统自评结果逐项对照'],
      [1, '补救责任要明确到岗位', 'evidence', '从岗位记录查出纠正错误的人和补救时限']
    ]
  },
  周以宁: {
    stanceClaim: '支持有限范围试点',
    arguments: [
      [0, '规则固定且后果较轻的问题适合先试用', 'condition', '规则固定、后果轻微且能随时转人工时'],
      [0, '系统应把完整上下文转给人工', 'evidence', '检查系统转交时是否带上必要的对话上下文'],
      [0, '抽查异常答复时应还原规则版本', 'evidence', '抽查异常答复对应的规则版本与原始输入'],
      [0, '访问与修改动作都要留痕', 'evidence', '核对访问日志中的人员、操作时间和修改记录']
    ]
  },
  顾行舟: {
    stanceClaim: '按问题类型比较效果',
    arguments: [
      [0, '不同问题分组比较能看出答复稳定性', 'evidence', '按问题类型分组比较正确率与退出比例'],
      [1, '人工等待时长应单独记录', 'evidence', '记录人工接手前后各自的等待时长'],
      [1, '答案正确不代表诉求已经解决', 'condition', '用户问题解决后再统计答复是否有效时'],
      [1, '自动答复和人工接手各自承担的责任', 'evidence', '公布评估时列出自动答复与人工接手各自的责任记录']
    ]
  },
  沈清和: {
    stanceClaim: '支持范围清楚且可以撤回的方案先行试行',
    arguments: [
      [0, '范围清楚的方案适合作为第一步', 'condition', '试点范围可在出现例外时及时退出'],
      [0, '公开受益对象和成本承担者能看清分配差异', 'evidence', '把受益群体和承担成本的群体逐项列出'],
      [0, '预期目标和观察方式应在试行前公开', 'evidence', '对照事前目标、观察周期和实际结果'],
      [0, '开始前应约定暂停或调整条件', 'condition', '触发条件事先写明且有人负责执行时']
    ]
  },
  顾南乔: {
    stanceClaim: '统一安排会让选择较少的人群承担成本',
    arguments: [
      [1, '一致安排可能让选择较少的人承担更多代价', 'example', '同一规则影响选择较少的居民时'],
      [1, '按受益程度分担费用', 'condition', '受益者和承担成本者不是同一群体时'],
      [1, '不同群体受到的影响差异应分别评估', 'evidence', '分别对比不同群体的成本、收益与影响'],
      [0, '受影响者应有明确反馈渠道', 'example', '受影响者提交意见后能收到处理结果']
    ]
  },
  周景行: {
    stanceClaim: '有条件支持逐步实施',
    arguments: [
      [0, '适用对象和时段应先限定', 'condition', '先明确试点适用的对象和时段时'],
      [0, '公开收益时应同步说明各群体承担的成本', 'evidence', '公开整体收益时同时列出成本承担群体'],
      [0, '评估指标应在试行前确定', 'evidence', '对照预先登记的指标与实际变化'],
      [0, '执行者应预先知道哪些情况必须触发调整', 'condition', '出现预设情形并达到调整门槛时']
    ]
  },
  林予川: {
    stanceClaim: '现场差异不能被单一指标覆盖',
    arguments: [
      [1, '不同地点的条件差异很大', 'example', '不同地点的通行条件与替代方案差异很大'],
      [1, '临时补救会占用一线时间', 'evidence', '计算临时补救占用的工时和预算'],
      [1, '最终结果会漏掉现场反复调整的成本', 'evidence', '分地点记录调整次数与额外投入'],
      [1, '执行者应能直接上报问题', 'condition', '执行者发现问题时能直接上报并触发复核']
    ]
  },
  唐知意: {
    stanceClaim: '支持小范围试行',
    arguments: [
      [0, '样本覆盖范围决定结果适用于哪些情形', 'evidence', '在样本说明中列出不同地点、时段和对象'],
      [0, '收益与代价应分别按群体拆分核算', 'evidence', '分别对照各群体获得的收益和承担的代价'],
      [1, '报告结果时应说明不确定性', 'evidence', '同时报告样本量、误差范围和异常情况'],
      [0, '阶段复核能把新证据纳入下一步安排', 'condition', '阶段复核仍达到预设标准时再扩大']
    ]
  },
  'general:许闻溪': {
    stanceClaim: '出现问题时先明确责任与补救办法',
    arguments: [
      [1, '预设范围外的情况应暂停并转入人工判断', 'condition', '出现预设范围外情况并触发暂停规则时'],
      [0, '估算方案成本时应计入补救支出', 'evidence', '在成本表中单列人员补救和跟进支出'],
      [1, '方案失效信号应在试行前约定', 'evidence', '记录哪些信号会让方案停止或修改'],
      [1, '出现问题后应指定跟进负责人', 'example', '问题发生后指定一名负责人跟到补救完成']
    ]
  }
};

function enrichProfiles(
  group: MockTopicGroup,
  profiles: readonly BaseSpeakerProfile[]
): SpeakerProfile[] {
  return profiles.map((profile) => {
    const metadata =
      PROFILE_METADATA[`${group}:${profile.name}`] ??
      PROFILE_METADATA[profile.name];
    if (!metadata || metadata.arguments.length !== profile.arguments.length) {
      throw new Error(`Missing mock profile metadata for ${profile.name}`);
    }
    return {
      ...profile,
      stanceClaim: metadata.stanceClaim,
      arguments: profile.arguments.map((argument, index) => {
        const row = metadata.arguments[index];
        const issue = MOCK_ISSUE_GROUPS[group].find(
          (candidate) => candidate.issue === argument.issue
        );
        if (!row || !issue) {
          throw new Error(`Missing mock argument metadata for ${profile.name}`);
        }
        return {
          ...argument,
          side: issue.sides[row[0]],
          claim: row[1],
          detail: { kind: row[2], text: row[3] }
        };
      })
    };
  });
}

export const MOCK_PROFILE_GROUPS: Record<
  MockTopicGroup,
  readonly SpeakerProfile[]
> = {
  programming: enrichProfiles('programming', RAW_PROFILE_GROUPS.programming),
  service: enrichProfiles('service', RAW_PROFILE_GROUPS.service),
  general: enrichProfiles('general', RAW_PROFILE_GROUPS.general)
};

export function topicGroup(topic: string): MockTopicGroup {
  if (/程序|编程|开发|代码|软件/u.test(topic)) {
    return 'programming';
  }
  if (/客服|服务|用户|消费者/u.test(topic)) {
    return 'service';
  }
  return 'general';
}

export function topicIssues(topic: string): readonly MockIssueDefinition[] {
  return MOCK_ISSUE_GROUPS[topicGroup(topic)];
}

export function topicProfiles(topic: string): SpeakerProfile[] {
  return [...MOCK_PROFILE_GROUPS[topicGroup(topic)]];
}

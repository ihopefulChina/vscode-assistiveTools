// 查询任务信息 (GET /collect/card/taskInfo)

interface I查询任务信息Query {
  taskType: string;
}

interface IResponse {
  code?: number;
  message?: string;
  data?: IResponseData;
}

interface IResponseData {
  /** 业务返回描述 */
  desc?: string;
  /** 业务返回码 */
  code?: number;
  /** 业务返回数据 */
  data?: IResponseDataData;
  /** 业务是否正常返回 */
  success?: boolean;
}

interface IResponseDataData {
  /** 集卡任务model */
  collectCardTaskModel?: IResponseDataDataCollectCardTaskModel;
  /** 每日集卡任务列表 */
  taskScoreDTOList?: IResponseDataDataTaskScoreDTOListItem[];
}

interface IResponseDataDataCollectCardTaskModel {
  /** 开始时间 */
  beginTime?: string;
  /** 结束时间 */
  endTime?: string;
  /** 服务器时间 */
  serverTime?: string;
  /** 状态 0未开始 1进行中 2已结束 */
  status?: number;
  /** 卡片信息 */
  cardInfo?: IResponseDataDataCollectCardTaskModelCardInfo;
}

interface IResponseDataDataTaskScoreDTOListItem {
  /** 分数 */
  score?: number;
  /** 任务类型 */
  taskType?: number;
  /** 任务列表 */
  taskConfigs?: IResponseDataDataTaskScoreDTOListItemTaskConfigsItem[];
}

interface IResponseDataDataCollectCardTaskModelCardInfo {
  /** 总卡片数 */
  totalCount?: number;
  /** 卡片收集信息 */
  cardCollectInfos?: IResponseDataDataCollectCardTaskModelCardInfoCardCollectInfosItem[];
}

interface IResponseDataDataTaskScoreDTOListItemTaskConfigsItem {
  /** 分数 */
  score?: number;
  /** 奖品信息 */
  prizeList?: IResponseDataDataTaskScoreDTOListItemTaskConfigsItemPrizeListItem[];
}

interface IResponseDataDataCollectCardTaskModelCardInfoCardCollectInfosItem {
  /** 单个数量 */
  count?: number;
  /** 卡信息 */
  cardInfo?: IResponseDataDataCollectCardTaskModelCardInfoCardCollectInfosItemCardInfo;
}

interface IResponseDataDataTaskScoreDTOListItemTaskConfigsItemPrizeListItem {
  /** 奖励类型 */
  rewardType?: number;
  /** 商品id */
  itemId?: string;
  /** 数量 */
  amount?: number;
  /** 商品名字 */
  itemName?: string;
  /** 商品图片 */
  imageUrl?: string;
  /** 100:个 200:天 220:月 */
  salesUnit?: number;
  /** 销售单位值 */
  salesUnitValue?: number;
}

interface IResponseDataDataCollectCardTaskModelCardInfoCardCollectInfosItemCardInfo {
  /** 卡code */
  cardCode?: number;
  /** 卡的名字 */
  cardName?: string;
  /** 卡图片url */
  cardUrl?: string;
}

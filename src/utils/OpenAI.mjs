import axios from 'axios';
import { config } from './Storage.mjs';
import { OPENAI_TIMEOUT, OPENAI_FREE_BASE_URL, OPENAI_FREE_MODEL_ID } from '../const.mjs';
import { getDeviceId, getOpenAiConfig, getRandomItem } from './Utils.mjs';

export const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};
export const getFreeModelInfo = async () => {
  return axios.get(
    `https://api2.immersivetranslate.com/big-model/get-token?deviceId=${getDeviceId()}`
  );
};
export const getModelList = (options) => {
  const conf = {};
  const baseURL = config.get('baseURL').split(',')[0];
  const key = config.get('key');
  if (key) {
    conf['Authorization'] = `Bearer ${key.split(',')[0]}`;
  }
  return axios({
    url: `/models`,
    method: 'get',
    baseURL,
    headers: {
      ...headers,
      ...conf,
    },
    ...options,
  }).then((res) =>
    res.data.data
      .filter(
        (item) =>
          !item.id.toLocaleLowerCase().includes('embedding') &&
          !item.id.toLocaleLowerCase().includes('reranker')
      )
      .map((item) => ({ ...item, value: item.id, name: item.id }))
  );
};

export const chat = (data, baseURL, apiKey) => {
  const key = apiKey || getOpenAiConfig('key');
  const headersConf = { ...headers, Authorization: key ? `Bearer ${key}` : `` };
  return axios({
    url: `/chat/completions`,
    method: 'post',
    baseURL: baseURL || getOpenAiConfig('baseURL'),
    headers: headersConf,
    timeout: OPENAI_TIMEOUT,
    data: {
      think: false,
      stream: false,
      thinking: { type: 'disabled' },
      model: data.model || getOpenAiConfig('model'),
      ...data,
    },
  });
};
export const freeChat = async (data) => {
  const config = await getFreeModelInfo();
  data.model = getRandomItem(OPENAI_FREE_MODEL_ID);
  return chat(data, OPENAI_FREE_BASE_URL, config.data.apiToken);
};

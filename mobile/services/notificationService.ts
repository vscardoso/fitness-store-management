import api from './api';

export interface PushTokenData {
  token: string;
  device_type?: string;
}

export const notificationService = {
  async registerToken(token: string, deviceType?: string) {
    const response = await api.post('/notifications/token', {
      token,
      device_type: deviceType,
    });
    return response.data;
  },

  async sendNotification(userIds: number[], title: string, body: string, data?: any) {
    const response = await api.post('/notifications/send', {
      user_ids: userIds,
      title,
      body,
      data,
    });
    return response.data;
  },
};

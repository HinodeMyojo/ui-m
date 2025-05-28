import imgTest from "./imgTest";

const taskData = {
  id: 0,
  title: "Тестовая задача",
  description: "Нужно сделать очень много всего",
  start_date: "20.05.2025",
  end_date: "31.05.2025",
  totalDays: 11,
  currentDay: 2,
  total: 3,
  completed: 1,
  required: 2,
  chatId: "main",
  chat: {
    id: "main",
    name: "Чат задачи",
    messages: [
      {
        id: 0,
        userId: 0,
        userName: "HinodeMyojo",
        text: "Привет, это чат основной задачи",
        date: "12.05.2025 12:12:12",
        attachments: {
          images: [],
          files: [],
        },
      },
      {
        id: 1,
        userId: 1,
        userName: "Z0371",
        text: "Привет, я добавил файлы",
        date: "12.05.2025 12:13:12",
        attachments: {
          images: [
            {
              id: "1a309bb3-275e-4a95-94f4-924762457658",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
          ],
          files: [
            {
              id: "1a309bb3-275e-4a95-94f4-924762457660",
              name: "main_task.txt",
              type: "text/plain",
              size: 1024,
              url: "#",
            },
          ],
        },
      },
    ],
  },
};

export default taskData;

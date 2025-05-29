import imgTest from "./imgTest";
import chat from "./test";



// на создание ->
title: "Тестовая задача",
description: "Нужно сделать очень много всего",
color: "blue",
start: "20.05.2025",
end: "31.05.2025",
subtasks: [
  {
  Title, 
}]

// на получение ->
const taskData = {
  id: 0,
  title: "Тестовая задача",
  description: "Нужно сделать очень много всего",
  color: "blue",
  start: "20.05.2025",
  end: "31.05.2025",
  totalDays: 11,
  currentDay: 2,
  total: 3,
  completed: 1,
  required: 2,
  subtasks: [
    {
      id: 0,
      title: "Подзадача 1",
      description: "Подзадача 1 подзадача 1 подзадача 1 подзадача 1",
      chatId: "1a309bb3-275e-4a95-94f4-924762457657",
      status: "done",
    },
  ],
  chatId: "1a309bb3-275e-4a95-94f4-924762457657",


  получение чата:
  {
    id: 0,
    task_name: "Подзадача_1",
    messages: [
      {
        id: 0,
        userId: 0,
        userName: "HinodeMyojo",
        text: "Привет",
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
        text: "Привет",
        date: "12.05.2025 12:13:12",
        attachments: {
          images: [
            {
              id: "1a309bb3-275e-4a95-94f4-924762457658",
              thumbnail: imgTest,
              original: imgTest, // В реальном приложении здесь будет URL оригинального изображения
              type: "image/jpeg",
            },
            {
              id: "1a309bb3-275e-4a95-94f4-924762457659",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
          ],
          files: [
            {
              id: "1a309bb3-275e-4a95-94f4-924762457660",
              name: "test.txt",
              type: "text/plain",
              url: "#", // В реальном приложении здесь будет URL для скачивания
            },
            {
              id: "1a309bb3-275e-4a95-94f4-924762457661",
              name: "test.xml",
              type: "text/xml",
              url: "#",
            },
          ],
        },
      },
  // chat: {
  //   id: "main",
  //   name: "Чат задачи",
  //   messages: [
  //     {
  //       id: 0,
  //       userId: 0,
  //       userName: "HinodeMyojo",
  //       text: "Привет, это чат основной задачи",
  //       date: "12.05.2025 12:12:12",
  //       attachments: {
  //         images: [],
  //         files: [],
  //       },
  //     },
  //     {
  //       id: 1,
  //       userId: 1,
  //       userName: "Z0371",
  //       text: "Привет, я добавил файлы",
  //       date: "12.05.2025 12:13:12",
  //       attachments: {
  //         images: [
  //           {
  //             id: "1a309bb3-275e-4a95-94f4-924762457658",
  //             thumbnail: imgTest,
  //             original: imgTest,
  //             type: "image/jpeg",
  //             size: 1024 * 1024,
  //           },
  //         ],
  //         files: [
  //           {
  //             id: "1a309bb3-275e-4a95-94f4-924762457660",
  //             name: "main_task.txt",
  //             type: "text/plain",
  //             size: 1024,
  //             url: "#",
  //           },
  //         ],
  //       },
  //     },
  //   ],
  // },
};

export default taskData;

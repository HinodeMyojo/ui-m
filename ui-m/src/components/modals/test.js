import imgTest from "./imgTest";

const chat = {
  0: {
    id: 0,
    name: "Подзадача_1",
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
              size: 1024 * 1024, // 1MB
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
              size: 1024, // 1KB
              url: "#", // В реальном приложении здесь будет URL для скачивания
            },
            {
              id: "1a309bb3-275e-4a95-94f4-924762457661",
              name: "test.xml",
              type: "text/xml",
              size: 2048, // 2KB
              url: "#",
            },
          ],
        },
      },
      {
        id: 2,
        userId: 1,
        userName: "Z0371",
        text: "Привет",
        date: "12.05.2025 12:14:12",
        attachments: {
          images: [
            {
              id: "1a309bb3-275e-4a95-94f4-924762457662",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
            {
              id: "1a309bb3-275e-4a95-94f4-924762457663",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
            {
              id: "1a309bb3-275e-4a95-94f4-924762457664",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
          ],
          files: [],
        },
      },
    ],
  },
  1: {
    id: 1,
    name: "Подзадача_2",
    messages: [
      {
        id: 0,
        userId: 0,
        userName: "HinodeMyojo",
        text: "Билибоба",
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
        date: "12.05.2025 12:12:12",
        attachments: {
          images: [
            {
              id: "1a309bb3-275e-4a95-94f4-924762457665",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
            {
              id: "1a309bb3-275e-4a95-94f4-924762457666",
              thumbnail: imgTest,
              original: imgTest,
              type: "image/jpeg",
              size: 1024 * 1024,
            },
          ],
          files: [],
        },
      },
    ],
  },
};

export default chat;

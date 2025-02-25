# Используем официальный образ Node.js на Alpine
FROM node:18-alpine

# Создаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Открываем порт приложения
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"]

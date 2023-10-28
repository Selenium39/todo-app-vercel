import { Box, Button, VStack, Icon, Input, Textarea, Text, HStack, Tooltip, IconButton } from "@chakra-ui/react";
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import { FaCheckCircle, FaTrash, FaRegClipboard } from "react-icons/fa";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY || '',
  {
    auth:{
      persistSession: true
    }
  }
);

interface Todo {
  id?: number;
  title: string;
  description: string;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
}

interface Folder {
  date: string;
  todos: Todo[];
  isOpen: boolean;
}

const IndexPage = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newTodo, setNewTodo] = useState<Todo>({
    title: "",
    description: "",
    completed: false,
    created_at: "",
    completed_at: null
  });
  const [reportData, setReportData] = useState<string>('');
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);


  useEffect(() => {
    fetchTodos();
  }, []);

  const checkCode = () => {
    const expectedCode = process.env.NEXT_PUBLIC_CODE;
    const storedCode = localStorage.getItem("TODO-CODE");
    if (!storedCode || storedCode !== expectedCode) {
      const enteredCode = prompt("请输入CODE:");
      if (enteredCode !== expectedCode) {
        throw new Error("CODE不正确");
      }
      localStorage.setItem("TODO-CODE", enteredCode);
    }
  };

  const fetchTodos = async () => {
    try {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        const uncompletedTodos = data.filter((todo: Todo) => !todo.completed);
        const completedTodos = data.filter((todo: Todo) => todo.completed);
        const today = dayjs().format('YYYY-MM-DD');
        const todayCompletedTodos = completedTodos.filter((todo: Todo) => dayjs(todo.completed_at).format('YYYY-MM-DD') === today);
        const otherCompletedTodos = completedTodos.filter((todo: Todo) => dayjs(todo.completed_at).format('YYYY-MM-DD') !== today);

        setTodos([...uncompletedTodos, ...todayCompletedTodos]);
        setFolders(groupTodosByDate(otherCompletedTodos));
      }
    } catch (error: any) {
      console.error("获取待办事项失败:", error.message);
    }
  };

  const groupTodosByDate = (todos: Todo[], excludeToday: boolean = true): Folder[] => {
    const groupedTodos: { [date: string]: Todo[] } = {};
    todos.forEach((todo: Todo) => {
      const date = dayjs(todo.completed_at);
      if (date.isValid()) {
        const formattedDate = date.format('YYYY-MM-DD');
        if (!groupedTodos[formattedDate]) {
          groupedTodos[formattedDate] = [];
        }
        groupedTodos[formattedDate].push(todo);
      }
    });

    const folders: Folder[] = [];
    for (const date in groupedTodos) {
      if (excludeToday && date === dayjs().format('YYYY-MM-DD')) {
        continue;
      }
      folders.push({
        date,
        todos: groupedTodos[date],
        isOpen: false
      });
    }
    folders.sort((a, b) => dayjs(b.date).diff(dayjs(a.date)));

    return folders;
  };

  const addTodo = async () => {
    if (newTodo.title.trim() !== "") {
      try {
        checkCode();
        const createdAt = new Date().toISOString();
        const { data, error } = await supabase
          .from("todos")
          .insert([{ ...newTodo, created_at: createdAt }]);
        if (error) {
          throw error;
        }
        await fetchTodos();
        setNewTodo({
          title: "",
          description: "",
          completed: false,
          created_at: "",
          completed_at: null
        });
      } catch (error: any) {
        console.error("添加待办事项失败:", error.message);
      }
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      checkCode();
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) {
        console.log("error", error);
      } else {
        await fetchTodos();
      }
    } catch (error: any) {
      console.error("删除待办事项失败:", error.message);
    }
  };

  const completeTodo = async (id: number, folderDate?: string) => {
    try {
      checkCode();
      let todo = todos.find((todo) => todo.id === id);
      if (!todo && folderDate) {
        const folder = folders.find((folder) => folder.date === folderDate);
        if (folder) {
          todo = folder.todos.find((todo) => todo.id === id);
        }
      }
      if (todo) {
        const completedAt = todo.completed ? null : new Date().toISOString();
        const { error } = await supabase
          .from("todos")
          .update({ completed: !todo.completed, completed_at: completedAt })
          .eq("id", id);

        if (error) {
          throw error;
        }

        await fetchTodos(); // Fetch updated todos from the backend
      }
    } catch (error: any) {
      console.error("完成待办事项失败:", error.message);
    }
  };

  const generateWeeklyReport = async () => {
    try {
      const oneWeekAgo = dayjs().subtract(5, 'day');

      const pastWeekCompletedTodos = todos.filter(todo =>
        todo.completed && dayjs(todo.completed_at).isAfter(oneWeekAgo)
      );

      const unfinishedTodos = todos.filter(todo => !todo.completed);

      const formatData = (todos: Todo[]) => {
        return todos.map(todo => `${todo.title}:${todo.description}`).join('\n');
      };

      const finishDatas = formatData(pastWeekCompletedTodos);
      const todoDatas = formatData(unfinishedTodos);

      // server send events
      const finishDataString = encodeURIComponent(finishDatas); // 格式化并编码数据
      const todoDataString = encodeURIComponent(todoDatas);

      // 使用查询参数传递数据
      const sseUrl = `/api/proxy?finishDatas=${finishDataString}&todoDatas=${todoDataString}&query=生成周报&user=Selenium39&response_mode=streaming`;

      const eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data && data.answer) {
          if (!isReportModalOpen) {
            setIsReportModalOpen(true);
          }
          setReportData(prevReport => prevReport + data.answer);
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE failed:", error);
        eventSource.close();
      };
    } catch (error: any) {
      console.error("生成周报失败:", error.message);
    }
  };

  const closeReportModal = () => {
    setIsReportModalOpen(false);
    setReportData('');
  };



  return (
    <Box p={4}>
      <VStack spacing={4} align="stretch">
        <Input
          type="text"
          placeholder="标题"
          value={newTodo.title}
          onChange={(e) =>
            setNewTodo({
              ...newTodo,
              title: e.target.value
            })
          }
        />
        <Textarea
          placeholder="描述"
          value={newTodo.description}
          onChange={(e) =>
            setNewTodo({
              ...newTodo,
              description: e.target.value
            })
          }
        />
        <Button colorScheme="blue" onClick={addTodo}>
          添加待办事项
        </Button>

        {/* 工具栏 */}
        {/* <HStack spacing={4} mt={4} justifyContent="flex-end">
          <Tooltip label="生成周报" placement="top">
            <IconButton
              aria-label="生成周报"
              icon={<FaRegClipboard />}
              colorScheme="teal"
              onClick={generateWeeklyReport}
            />
          </Tooltip>
        </HStack> */}
        {todos.map((todo) => (
          <Box
            key={todo.id}
            borderWidth="1px"
            p={4}
            bg={todo.completed ? "gray.200" : "white"}
            borderRadius="md"
            boxShadow="md"
            position="relative"
          >
            {/* Rest of the code */}
            {todo.completed && (
              <Box position="absolute" top={2} right={2}>
                <Icon
                  onClick={() => completeTodo((todo as any).id)}
                  as={FaCheckCircle}
                  color="green.500"
                  boxSize={6}
                />
              </Box>
            )}
            <Text fontWeight="bold">{todo.title}</Text>
            <ReactMarkdown>{todo.description}</ReactMarkdown>
            <Text fontSize="sm" color="gray.500" mt={2}>
              创建时间: {dayjs(todo.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </Text>
            {todo.completed && (
              <Text fontSize="sm" color="gray.500">
                完成时间: {dayjs(todo.completed_at).format('YYYY-MM-DD HH:mm:ss')}
              </Text>
            )}
            {!todo.completed && (
              <HStack spacing={2} mt={2}>
                <Button
                  colorScheme="green"
                  size="sm"
                  onClick={() => completeTodo((todo as any).id)}
                  leftIcon={<Icon as={FaCheckCircle} color="white" />}
                >
                  完成
                </Button>
                <Button
                  colorScheme="red"
                  size="sm"
                  onClick={() => deleteTodo((todo as any).id)}
                  leftIcon={<Icon as={FaTrash} color="white" />}
                >
                  删除
                </Button>
              </HStack>
            )}
          </Box>
        ))}
        {folders.map((folder) => (
          <Box key={folder.date}>
            <Button
              variant="link"
              color="blue.500"
              onClick={() => {
                const updatedFolders = [...folders];
                const folderIndex = updatedFolders.findIndex(
                  (f) => f.date === folder.date
                );
                updatedFolders[folderIndex].isOpen = !updatedFolders[
                  folderIndex
                ].isOpen;
                setFolders(updatedFolders);
              }}
            >
              {folder.date}
            </Button>
            {folder.isOpen && (
              <VStack spacing={2} align="stretch">
                {folder.todos.map((todo) => (
                  <Box
                    key={todo.id}
                    borderWidth="1px"
                    p={4}
                    bg={todo.completed ? "gray.200" : "white"}
                    position="relative"
                  >
                    {todo.completed && (
                      <Box position="absolute" top={2} right={2}>
                        <Icon
                          onClick={() => completeTodo((todo as any).id, folder.date)}
                          as={FaCheckCircle}
                          color="green.500"
                          boxSize={6}
                        />
                      </Box>
                    )}
                    <strong>{todo.title}</strong>
                    <ReactMarkdown>{todo.description}</ReactMarkdown>
                    <Text>
                      创建时间: {dayjs(todo.created_at).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                    {todo.completed && (
                      <Text>
                        完成时间: {dayjs(todo.completed_at).format('YYYY-MM-DD HH:mm:ss')}
                      </Text>
                    )}
                  </Box>
                ))}
              </VStack>
            )}
          </Box>
        ))}
        {/* 周报模态框 */}
        {isReportModalOpen && (
          <Modal isOpen={isReportModalOpen} onClose={closeReportModal}>
            <ModalOverlay />
            <ModalContent maxWidth="80%" height="70vh">
              <ModalHeader>周报</ModalHeader>
              <ModalCloseButton />
              <ModalBody overflowY="auto" maxHeight="600px">
                <pre>{reportData}</pre>
              </ModalBody>
            </ModalContent>
          </Modal>
        )}
      </VStack>
    </Box>
  );
};

export default IndexPage;

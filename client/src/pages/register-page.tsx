import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FormControl,
  FormLabel,
  Input,
  Button,
  Form,
  FormItem,
  FormField,
} from "@/components/ui/form";

// Assuming insertUserSchema is defined elsewhere and includes username, email, and password
const insertUserSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});


function RegistrationForm() {
  const form = useForm({
    resolver: zodResolver(
      insertUserSchema.extend({
        confirmPassword: z.string(),
        preferredName: z.string().optional(),
      })
    ),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      preferredName: "",
    },
  });

  const onSubmit = (data) => {
    // Handle form submission here.  Data will now include preferredName
    console.log(data);
  };

  return (
    <Form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Username</FormLabel>
            <FormControl>
              <Input placeholder="username" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input type="email" placeholder="email" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Password</FormLabel>
            <FormControl>
              <Input type="password" placeholder="password" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="confirmPassword"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Confirm Password</FormLabel>
            <FormControl>
              <Input type="password" placeholder="confirm password" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="preferredName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Preferred Name (optional)</FormLabel>
            <FormControl>
              <Input placeholder="preferred name" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
      <Button type="submit">Submit</Button>
    </Form>
  );
}

export default RegistrationForm;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { profileService } from "../services/profile.service";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { UserProfile } from "@shared-types";
import { useTranslations } from "next-intl";
import showToast from "../../../shared/utils/toast";

export const useProfile = (userId?: string) => {
  const { user: currentUser, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const t = useTranslations("features.profile.toasts");
  const isOwnProfile = !userId || userId === currentUser?.id;

  const profileQuery = useQuery({
    queryKey: ["profile", userId || currentUser?.id],
    queryFn: () => profileService.getProfile(userId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3,
    enabled: !!(userId || currentUser?.id),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: Parameters<typeof profileService.updateProfile>[0]) => {
      if (!isOwnProfile)
        throw new Error("Cannot update another user's profile");
      return profileService.updateProfile(data);
    },
    onSuccess: (updatedUser: UserProfile) => {
      if (useAuthStore.getState().user?.id !== updatedUser.id) return;
      setUser(updatedUser);
      queryClient.setQueryData(["profile", currentUser?.id], updatedUser);
      showToast.success(t("profile_updated"));
    },
    onError: () => {
      showToast.error(t("profile_update_failed"));
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      if (!isOwnProfile) throw new Error("Cannot update another user's avatar");
      return profileService.uploadAvatar(file);
    },
    onSuccess: (data) => {
      const activeUser = useAuthStore.getState().user;
      if (activeUser && activeUser.id === currentUser?.id) {
        const updatedUser = { ...activeUser, avatarUrl: data.avatarUrl };
        setUser(updatedUser);
        queryClient.setQueryData(["profile", currentUser.id], updatedUser);
      }
      showToast.success(t("avatar_updated"));
    },
    onError: () => {
      showToast.error(t("avatar_update_failed"));
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: (newEmail: string) => profileService.changeEmail(newEmail),
    onSuccess: () => {
      showToast.success(t("email_verification_sent"));
    },
    onError: () => {
      showToast.error(t("email_change_failed"));
    },
  });

  const verifyEmailChangeMutation = useMutation({
    mutationFn: ({ token, newEmail }: { token: string; newEmail: string }) =>
      profileService.verifyEmailChange(token, newEmail),
    onSuccess: () => {
      showToast.success(t("email_updated"));
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => {
      showToast.error(t("email_verify_failed"));
    },
  });

  const updateThemeMutation = useMutation({
    mutationFn: (theme: "light" | "dark") =>
      profileService.updateProfile({ theme }),
    onSuccess: (updatedUser) => {
      if (useAuthStore.getState().user?.id !== updatedUser.id) return;
      setUser(updatedUser);
      queryClient.setQueryData(["profile", currentUser?.id], updatedUser);
    },
  });

  const updateTheme = (newTheme: "light" | "dark") =>
    updateThemeMutation.mutate(newTheme);

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    isPending: profileQuery.isPending,
    isError: profileQuery.isError,
    updateProfile: updateProfileMutation.mutate,
    updateProfileAsync: updateProfileMutation.mutateAsync,
    isUpdating: updateProfileMutation.isPending,
    uploadAvatar: uploadAvatarMutation.mutate,
    isUploading: uploadAvatarMutation.isPending,
    changeEmail: changeEmailMutation.mutate,
    isChangingEmail: changeEmailMutation.isPending,
    verifyEmailChange: verifyEmailChangeMutation.mutate,
    isVerifyingEmailChange: verifyEmailChangeMutation.isPending,
    updateTheme,
    isOwnProfile,
  };
};

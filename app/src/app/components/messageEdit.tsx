import React, { useEffect, useState } from "react";
import * as classes from "./messageEdit.module.css";
import { Button, Skeleton, SkeletonItem, Subtitle1 } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { AdminService, InspectLastEditResult, Message } from "app/openapi";
import { Alert } from "@fluentui/react-components/unstable";
import { useAutoScrollUpdateSignal } from "./autoScroll";

interface P {
  message: Message;
  userMessage?: Message;
  onClose: () => void;
}

export default function MessageEditComponent({ message, userMessage, onClose }: P) {
  const [inspectionData, setInspectionData] = useState<InspectLastEditResult>(null)
  const [error, setError] = useState(null);
  const autoScrollUpdate = useAutoScrollUpdateSignal();

  async function fetchInspectionData() {
    try {
      setInspectionData(await AdminService.getMessagesInspectLastEdit(message.id));
      autoScrollUpdate();
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    fetchInspectionData();
  }, []);

  return (
    <div className={classes.container}>
      <div className={classes.headingRow}>
        <Subtitle1>Improve this message</Subtitle1>
        <Button icon={<DismissRegular />} appearance="transparent" onClick={onClose} />
      </div>
      {inspectionData === null && error === null ? (
        <Skeleton>
          <SkeletonItem size={32} />
          <div style={{ height: "16px" }} />
          <SkeletonItem size={32} />
        </Skeleton>
      ) : null}
      {error !== null ? (
        <Alert intent="error" action={<Button onClick={fetchInspectionData}>Retry</Button>}>
          {error.message}
        </Alert>
      ) : null}
      {inspectionData !== null ? (
        <>
          {JSON.stringify(inspectionData)}
        </>
      ) : null}
    </div>
  );
}

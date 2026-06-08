import { Component, ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: "#fff" }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#ef4444", marginBottom: 12 }}>
            Something crashed
          </Text>
          <ScrollView>
            <Text selectable style={{ fontFamily: "monospace", fontSize: 12, color: "#111827" }}>
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}
